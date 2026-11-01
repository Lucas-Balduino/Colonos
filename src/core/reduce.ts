import { createBeginnerBoard, createRandomBoard, hexesOfVertex } from "./board.ts";
import { nextInt, shuffle } from "./rng.ts";
import {
  COSTS,
  RESOURCE_LABEL,
  addTo,
  cloneResources,
  countResources,
  emptyResources,
  fullBank,
  hasAtLeast,
  subFrom,
} from "./resources.ts";
import {
  RuleError,
  assertCurrent,
  bestBankRatio,
  canAfford,
  checkVictory,
  consumeDev,
  currentPlayer,
  distanceOk,
  mustDiscard,
  playerById,
  roadTouchesNetwork,
  robberVictims,
} from "./rules.ts";
import { refreshAwards } from "./scoring.ts";
import { actionShapeError, normalizeAction } from "./validate.ts";
import {
  RESOURCES,
  type Action,
  type CreateGameOptions,
  type DevCardType,
  type GameEvent,
  type GameState,
  type Player,
  type PlayerId,
  type ReduceResult,
  type Resource,
  type ResourceMap,
  type TradeResponse,
} from "./types.ts";

const COLORS = ["#c44536", "#2b6cb0", "#d97706", "#e8e0d0"];

function log(state: GameState, text: string, playerId?: PlayerId): void {
  state.log.push({ text, playerId });
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

function pay(state: GameState, player: Player, cost: Partial<ResourceMap>, label: string): void {
  if (!subFrom(player.resources, cost)) {
    throw new RuleError("cannot-afford", `Recursos insuficientes para ${label}.`);
  }
  addTo(state.bank, cost);
}

function takeFromBank(state: GameState, player: Player, gain: Partial<ResourceMap>): void {
  if (!subFrom(state.bank, gain)) {
    throw new RuleError("bank-empty", "O banco não tem esses recursos.");
  }
  addTo(player.resources, gain);
}

function recurso(resource: Resource): string {
  return RESOURCE_LABEL[resource].toLowerCase();
}

function listaRecursos(map: ResourceMap): string {
  const parts = RESOURCES.filter((resource) => map[resource] > 0).map(
    (resource) => `${map[resource]} ${recurso(resource)}`,
  );
  if (parts.length <= 1) return parts[0] ?? "nada";
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function freshResponses(state: GameState, from: PlayerId): Record<PlayerId, TradeResponse> {
  const responses: Record<PlayerId, TradeResponse> = {};
  for (const player of state.players) {
    if (player.id !== from) responses[player.id] = "pending";
  }
  return responses;
}

let pendingEvents: GameEvent[] = [];

function emit(event: GameEvent): void {
  pendingEvents.push(event);
}

function noteAwards(state: GameState): void {
  const road = state.longestRoadPlayerId;
  const army = state.largestArmyPlayerId;
  refreshAwards(state.board, state.players, state);
  if (state.longestRoadPlayerId !== road) {
    emit({ type: "award", kind: "longestRoad", playerId: state.longestRoadPlayerId });
  }
  if (state.largestArmyPlayerId !== army) {
    emit({ type: "award", kind: "largestArmy", playerId: state.largestArmyPlayerId });
  }
}

function finishIfWon(state: GameState, player: Player): void {
  if (state.phase.type === "gameOver") return;
  checkVictory(state, player);
  const phaseType: string = state.phase.type;
  if (phaseType === "gameOver") emit({ type: "won", playerId: player.id });
}

function produce(state: GameState, total: number): void {
  const claims: Array<{
    hexId: string;
    vertexId: string;
    player: Player;
    resource: Resource;
    n: number;
  }> = [];
  for (const hex of Object.values(state.board.hexes)) {
    if (hex.number !== total) continue;
    if (hex.id === state.board.robberHexId) continue;
    if (hex.terrain === "desert") continue;
    const res = hex.terrain;
    for (const vid of hex.vertices) {
      const b = state.board.vertices[vid]?.building;
      if (!b) continue;
      const player = playerById(state, b.owner);
      const n = b.type === "city" ? 2 : 1;
      claims.push({ hexId: hex.id, vertexId: vid, player, resource: res, n });
    }
  }
  for (const resource of ["wood", "brick", "sheep", "wheat", "ore"] as Resource[]) {
    const owedBy = new Map<PlayerId, { player: Player; n: number }>();
    for (const claim of claims) {
      if (claim.resource !== resource) continue;
      const row = owedBy.get(claim.player.id) ?? { player: claim.player, n: 0 };
      row.n += claim.n;
      owedBy.set(claim.player.id, row);
    }
    const receivers = [...owedBy.values()].filter((row) => row.n > 0);
    if (receivers.length === 0) continue;
    const owed = receivers.reduce((sum, row) => sum + row.n, 0);
    const paid = new Map<PlayerId, number>();
    if (owed <= state.bank[resource]) {
      for (const row of receivers) {
        subFrom(state.bank, { [resource]: row.n });
        addTo(row.player.resources, { [resource]: row.n });
        paid.set(row.player.id, row.n);
      }
    } else {
      log(state, `O banco não tem ${recurso(resource)} suficiente.`);
      if (receivers.length === 1) {
        const row = receivers[0]!;
        const give = Math.min(row.n, state.bank[resource]);
        if (give > 0) {
          subFrom(state.bank, { [resource]: give });
          addTo(row.player.resources, { [resource]: give });
          paid.set(row.player.id, give);
        }
      }
    }
    const left = new Map(paid);
    for (const claim of claims) {
      if (claim.resource !== resource) continue;
      const remain = left.get(claim.player.id) ?? 0;
      if (remain <= 0) continue;
      const amount = Math.min(claim.n, remain);
      left.set(claim.player.id, remain - amount);
      if (amount <= 0) continue;
      emit({
        type: "produced",
        hexId: claim.hexId,
        playerId: claim.player.id,
        vertexId: claim.vertexId,
        resource,
        amount,
      });
    }
  }
}

function placeSettlement(state: GameState, player: Player, vertexId: string, setup: boolean): void {
  const v = state.board.vertices[vertexId];
  if (!v) throw new RuleError("bad-vertex", "Interseção inválida.");
  if (!distanceOk(state, vertexId)) {
    throw new RuleError("distance", "A regra da distância não permite construir aqui.");
  }
  if (!setup) {
    const connected = v.edges.some((eid) => state.board.edges[eid]?.road === player.id);
    if (!connected) throw new RuleError("network", "A aldeia precisa se conectar às suas estradas.");
    if (player.settlementsLeft <= 0) throw new RuleError("pieces", "Sem aldeias restantes.");
    pay(state, player, COSTS.settlement, "aldeia");
  } else if (player.settlementsLeft <= 0) {
    throw new RuleError("pieces", "Sem aldeias restantes.");
  }
  v.building = { type: "settlement", owner: player.id };
  player.settlements.push(vertexId);
  player.settlementsLeft -= 1;
  emit({ type: "built", kind: "settlement", id: vertexId, playerId: player.id });
}

function placeRoad(state: GameState, player: Player, edgeId: string, free: boolean): void {
  const e = state.board.edges[edgeId];
  if (!e) throw new RuleError("bad-edge", "Aresta inválida.");
  if (e.road) throw new RuleError("occupied", "Já existe uma estrada aqui.");
  if (player.roadsLeft <= 0) throw new RuleError("pieces", "Sem estradas restantes.");
  if (state.phase.type === "setupRoad") {
    const s = state.board.vertices[state.phase.settlement];
    if (!s || !e.vertices.includes(s.id)) {
      throw new RuleError("setup-road", "A estrada inicial deve tocar a aldeia recém-colocada.");
    }
  } else if (!roadTouchesNetwork(state, player, edgeId)) {
    throw new RuleError("network", "A estrada precisa se conectar à sua rede.");
  }
  if (!free) pay(state, player, COSTS.road, "estrada");
  e.road = player.id;
  player.roads.push(edgeId);
  player.roadsLeft -= 1;
  emit({ type: "built", kind: "road", id: edgeId, playerId: player.id });
  noteAwards(state);
}

function advanceSetupAfterRoad(state: GameState): void {
  const n = state.players.length;
  if (state.phase.type !== "setupRoad") return;
  if (state.phase.round === 1) {
    if (state.currentPlayerIndex < n - 1) {
      state.currentPlayerIndex += 1;
      state.phase = { type: "setupSettlement", round: 1 };
    } else {
      state.phase = { type: "setupSettlement", round: 2 };
    }
  } else {
    if (state.currentPlayerIndex > 0) {
      state.currentPlayerIndex -= 1;
      state.phase = { type: "setupSettlement", round: 2 };
    } else {
      state.phase = { type: "roll" };
      state.turnNumber = 1;
      log(state, "O jogo começou. Role os dados.");
    }
  }
}

function grantStartingResources(state: GameState, player: Player, vertexId: string): void {
  for (const hex of hexesOfVertex(state.board, vertexId)) {
    if (hex.terrain === "desert") continue;
    takeFromBank(state, player, { [hex.terrain]: 1 });
    emit({
      type: "produced",
      hexId: hex.id,
      playerId: player.id,
      vertexId,
      resource: hex.terrain,
      amount: 1,
    });
  }
}

function afterSeven(state: GameState): void {
  const queue = state.players.filter((p) => mustDiscard(p) > 0).map((p) => p.id);
  if (queue.length > 0) state.phase = { type: "discard", queue };
  else state.phase = { type: "moveRobber", after: "main" };
}

function afterRobberMove(state: GameState, player: Player, hexId: string, stealFrom?: PlayerId): void {
  const after = state.phase.type === "moveRobber" ? state.phase.after : "main";
  const victims = robberVictims(state, hexId, player.id);
  if (victims.length === 0) {
    state.phase = { type: after };
    return;
  }
  if (stealFrom) {
    if (!victims.includes(stealFrom)) throw new RuleError("steal-target", "Alvo inválido para roubo.");
    stealOne(state, player, stealFrom);
    state.phase = { type: after };
    return;
  }
  if (victims.length === 1) {
    stealOne(state, player, victims[0]!);
    state.phase = { type: after };
    return;
  }
  state.phase = { type: "steal", after, hexId };
}

function stealOne(state: GameState, thief: Player, fromId: PlayerId): void {
  const victim = playerById(state, fromId);
  const bag: Resource[] = [];
  for (const r of ["wood", "brick", "sheep", "wheat", "ore"] as Resource[]) {
    for (let i = 0; i < victim.resources[r]; i++) bag.push(r);
  }
  if (bag.length === 0) {
    emit({ type: "stole", thief: thief.id, victim: fromId, resource: null });
    return;
  }
  const pick = nextInt(state.rng, 0, bag.length - 1);
  state.rng = pick.rng;
  const res = bag[pick.value]!;
  victim.resources[res] -= 1;
  thief.resources[res] += 1;
  emit({ type: "stole", thief: thief.id, victim: victim.id, resource: res });
  log(state, `${thief.name} roubou uma carta de ${victim.name}.`, thief.id);
}

function nextTurn(state: GameState): void {
  const p = currentPlayer(state);
  finishIfWon(state, p);
  if (state.phase.type === "gameOver") return;
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (state.currentPlayerIndex === 0) state.turnNumber += 1;
  state.phase = { type: "roll" };
  state.dice = null;
  state.playedDevThisTurn = false;
  state.tradeOffers = [];
  state.offersThisTurn = 0;
  for (const card of currentPlayer(state).devCards) card.playable = true;
}

function apply(state: GameState, action: Action): void {
  if (state.phase.type === "gameOver") {
    throw new RuleError("game-over", "A partida já acabou.");
  }

  switch (action.type) {
    case "PLACE_SETTLEMENT": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "setupSettlement") {
        throw new RuleError("phase", "Agora não é hora de colocar aldeia inicial.");
      }
      placeSettlement(state, p, action.vertexId, true);
      if (state.phase.round === 2) grantStartingResources(state, p, action.vertexId);
      state.phase = { type: "setupRoad", round: state.phase.round, settlement: action.vertexId };
      log(state, `${p.name} fundou uma aldeia.`, p.id);
      return;
    }
    case "PLACE_ROAD": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type === "setupRoad") {
        placeRoad(state, p, action.edgeId, true);
        log(state, `${p.name} construiu uma estrada.`, p.id);
        advanceSetupAfterRoad(state);
        return;
      }
      if (state.phase.type === "freeRoads") {
        placeRoad(state, p, action.edgeId, true);
        state.phase.remaining -= 1;
        if (state.phase.remaining <= 0) state.phase = { type: state.phase.after };
        log(state, `${p.name} construiu uma estrada grátis.`, p.id);
        return;
      }
      throw new RuleError("phase", "Use BUILD_ROAD no turno principal.");
    }
    case "ROLL": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "roll") throw new RuleError("phase", "Não é hora de rolar.");
      const a = nextInt(state.rng, 1, 6);
      const b = nextInt(a.rng, 1, 6);
      state.rng = b.rng;
      state.dice = [a.value, b.value];
      emit({ type: "rolled", dice: [a.value, b.value] });
      const total = a.value + b.value;
      log(state, `${p.name} rolou ${a.value}+${b.value} = ${total}.`, p.id);
      if (total === 7) afterSeven(state);
      else {
        produce(state, total);
        state.phase = { type: "main" };
      }
      return;
    }
    case "DISCARD": {
      if (state.phase.type !== "discard") throw new RuleError("phase", "Ninguém precisa descartar agora.");
      const expected = state.phase.queue[0];
      if (expected !== action.playerId) throw new RuleError("not-your-turn", "Aguarde a sua vez de descartar.");
      const p = playerById(state, action.playerId);
      const need = mustDiscard(p);
      const giving = countResources(action.resources);
      if (giving !== need) {
        throw new RuleError("discard-count", `Descarte exatamente ${need} cartas.`);
      }
      if (!hasAtLeast(p.resources, action.resources)) {
        throw new RuleError("cannot-afford", "Você não tem esses recursos.");
      }
      subFrom(p.resources, action.resources);
      addTo(state.bank, action.resources);
      emit({ type: "discarded", playerId: p.id, count: need });
      state.phase.queue.shift();
      log(state, `${p.name} descartou ${need} cartas.`, p.id);
      if (state.phase.queue.length === 0) state.phase = { type: "moveRobber", after: "main" };
      return;
    }
    case "MOVE_ROBBER": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "moveRobber") throw new RuleError("phase", "Não é hora de mover o ladrão.");
      if (!state.board.hexes[action.hexId]) throw new RuleError("bad-hex", "Hexágono inválido.");
      if (action.hexId === state.board.robberHexId) {
        throw new RuleError("same-hex", "O ladrão deve ir para outro terreno.");
      }
      const fromHex = state.board.robberHexId;
      state.board.robberHexId = action.hexId;
      emit({ type: "robberMoved", from: fromHex, to: action.hexId, playerId: p.id });
      log(state, `${p.name} moveu o ladrão.`, p.id);
      afterRobberMove(state, p, action.hexId, action.stealFrom);
      return;
    }
    case "STEAL": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "steal") throw new RuleError("phase", "Não é hora de roubar.");
      const victims = robberVictims(state, state.phase.hexId, p.id);
      if (!victims.includes(action.from)) throw new RuleError("steal-target", "Alvo inválido.");
      const after = state.phase.after;
      stealOne(state, p, action.from);
      state.phase = { type: after };
      return;
    }
    case "TRADE_BANK": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main") throw new RuleError("phase", "Comércio só no turno principal.");
      const ratio = bestBankRatio(state, p, action.give);
      const cost = { [action.give]: ratio } as Partial<ResourceMap>;
      if (!canAfford(p, cost)) throw new RuleError("cannot-afford", `Precisa de ${ratio}:1 para o banco.`);
      if (state.bank[action.take] < 1) throw new RuleError("bank-empty", "Banco sem esse recurso.");
      pay(state, p, cost, "comércio marítimo");
      takeFromBank(state, p, { [action.take]: 1 });
      emit({ type: "tradedBank", playerId: p.id, give: action.give, take: action.take, ratio });
      log(state, `${p.name} trocou ${ratio} ${recurso(action.give)} por 1 ${recurso(action.take)}.`, p.id);
      return;
    }
    case "OFFER_TRADE": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main") throw new RuleError("phase", "Trocas só no turno principal.");
      if (state.tradeOffers.length > 0) throw new RuleError("offer-open", "Já existe uma oferta aberta.");
      if (countResources(action.give) === 0 || countResources(action.want) === 0) {
        throw new RuleError("empty-trade", "A oferta precisa dar e pedir algo.");
      }
      if (RESOURCES.some((r) => action.give[r] > 0 && action.want[r] > 0)) {
        throw new RuleError("same-resource", "Não dá para dar e pedir o mesmo recurso.");
      }
      if (!hasAtLeast(p.resources, action.give)) throw new RuleError("cannot-afford", "Você não tem o que oferece.");
      const id = `t${state.offerSeq++}`;
      state.offersThisTurn = (state.offersThisTurn ?? 0) + 1;
      state.tradeOffers.push({
        id,
        from: p.id,
        give: cloneResources(action.give),
        want: cloneResources(action.want),
        responses: freshResponses(state, p.id),
      });
      log(state, `${p.name} ofereceu uma troca.`, p.id);
      return;
    }
    case "ACCEPT_TRADE": {
      if (state.phase.type !== "main") throw new RuleError("phase", "Trocas só no turno principal.");
      const offer = state.tradeOffers.find((o) => o.id === action.offerId);
      if (!offer) throw new RuleError("no-offer", "Oferta inexistente.");
      if (offer.from === action.playerId) throw new RuleError("self-trade", "Não aceite a própria oferta.");
      if (offer.responses[action.playerId] !== "pending") {
        throw new RuleError("already-answered", "Essa resposta já foi dada.");
      }
      const other = playerById(state, action.playerId);
      if (!hasAtLeast(other.resources, offer.want)) {
        throw new RuleError("cannot-afford", "Você não tem o que a oferta pede.");
      }
      offer.responses[action.playerId] = "accepted";
      log(state, `${other.name} topou a troca.`, other.id);
      return;
    }
    case "CONFIRM_TRADE": {
      if (state.phase.type !== "main") throw new RuleError("phase", "Trocas só no turno principal.");
      const offer = state.tradeOffers.find((o) => o.id === action.offerId);
      if (!offer) throw new RuleError("no-offer", "Oferta inexistente.");
      if (offer.from !== action.playerId) throw new RuleError("not-yours", "Só quem ofereceu fecha a troca.");
      if (offer.responses[action.with] !== "accepted") {
        throw new RuleError("not-accepted", "Esse jogador não aceitou a troca.");
      }
      const other = playerById(state, action.with);
      const owner = playerById(state, offer.from);
      if (!hasAtLeast(owner.resources, offer.give) || !hasAtLeast(other.resources, offer.want)) {
        throw new RuleError("cannot-afford", "Alguém já não tem os recursos da troca.");
      }
      subFrom(owner.resources, offer.give);
      addTo(other.resources, offer.give);
      subFrom(other.resources, offer.want);
      addTo(owner.resources, offer.want);
      emit({
        type: "tradedPlayers",
        from: offer.from,
        to: other.id,
        give: cloneResources(offer.give),
        take: cloneResources(offer.want),
      });
      state.tradeOffers = state.tradeOffers.filter((o) => o.id !== offer.id);
      log(state, `${owner.name} trocou ${listaRecursos(offer.give)} por ${listaRecursos(offer.want)} com ${other.name}.`, owner.id);
      return;
    }
    case "REJECT_TRADE": {
      const offer = state.tradeOffers.find((o) => o.id === action.offerId);
      if (!offer) throw new RuleError("no-offer", "Oferta inexistente.");
      if (offer.from === action.playerId) throw new RuleError("self-trade", "Quem ofereceu não recusa a própria oferta.");
      if (offer.responses[action.playerId] !== "pending") {
        throw new RuleError("already-answered", "Essa resposta já foi dada.");
      }
      offer.responses[action.playerId] = "rejected";
      const waiting = state.players.filter((player) => player.id !== offer.from);
      if (waiting.every((player) => offer.responses[player.id] === "rejected")) {
        state.tradeOffers = state.tradeOffers.filter((item) => item.id !== offer.id);
      }
      return;
    }
    case "CANCEL_TRADE": {
      const offer = state.tradeOffers.find((o) => o.id === action.offerId);
      if (!offer) throw new RuleError("no-offer", "Oferta inexistente.");
      if (offer.from !== action.playerId) throw new RuleError("not-yours", "Só quem ofereceu pode cancelar.");
      state.tradeOffers = state.tradeOffers.filter((item) => item.from !== action.playerId);
      return;
    }
    case "BUILD_SETTLEMENT": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main") throw new RuleError("phase", "Construção só no turno principal.");
      placeSettlement(state, p, action.vertexId, false);
      noteAwards(state);
      log(state, `${p.name} construiu uma aldeia.`, p.id);
      finishIfWon(state, p);
      return;
    }
    case "BUILD_CITY": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main") throw new RuleError("phase", "Construção só no turno principal.");
      const v = state.board.vertices[action.vertexId];
      if (!v || v.building?.owner !== p.id || v.building.type !== "settlement") {
        throw new RuleError("no-settlement", "Só é possível evoluir a própria aldeia.");
      }
      if (p.citiesLeft <= 0) throw new RuleError("pieces", "Sem cidades restantes.");
      pay(state, p, COSTS.city, "cidade");
      v.building = { type: "city", owner: p.id };
      p.settlements = p.settlements.filter((id) => id !== action.vertexId);
      p.cities.push(action.vertexId);
      p.settlementsLeft += 1;
      p.citiesLeft -= 1;
      emit({ type: "built", kind: "city", id: action.vertexId, playerId: p.id });
      log(state, `${p.name} elevou uma aldeia a cidade.`, p.id);
      finishIfWon(state, p);
      return;
    }
    case "BUILD_ROAD": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main") throw new RuleError("phase", "Construção só no turno principal.");
      placeRoad(state, p, action.edgeId, false);
      log(state, `${p.name} construiu uma estrada.`, p.id);
      finishIfWon(state, p);
      return;
    }
    case "BUY_DEV": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main") throw new RuleError("phase", "Compre cartas no turno principal.");
      if (state.devDeck.length === 0) throw new RuleError("empty-deck", "O baralho acabou.");
      pay(state, p, COSTS.dev, "carta de desenvolvimento");
      const card = state.devDeck.pop()!;
      p.devCards.push({ type: card, playable: false });
      emit({ type: "devBought", playerId: p.id });
      log(state, `${p.name} comprou uma carta de desenvolvimento.`, p.id);
      finishIfWon(state, p);
      return;
    }
    case "PLAY_KNIGHT": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "roll" && state.phase.type !== "main") {
        throw new RuleError("phase", "Cavaleiro só antes da rolagem ou no turno principal.");
      }
      if (state.playedDevThisTurn) throw new RuleError("one-dev", "Só uma carta por turno.");
      consumeDev(p, action.type);
      state.playedDevThisTurn = true;
      p.knightsPlayed += 1;
      noteAwards(state);
      const after = state.phase.type === "roll" ? "roll" : "main";
      state.phase = { type: "moveRobber", after };
      emit({ type: "devPlayed", playerId: p.id, card: "knight" });
      log(state, `${p.name} jogou um cavaleiro.`, p.id);
      finishIfWon(state, p);
      return;
    }
    case "PLAY_ROAD_BUILDING": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main" && state.phase.type !== "roll") {
        throw new RuleError("phase", "Jogue a carta durante o seu turno.");
      }
      if (state.playedDevThisTurn) throw new RuleError("one-dev", "Só uma carta por turno.");
      consumeDev(p, action.type);
      state.playedDevThisTurn = true;
      emit({ type: "devPlayed", playerId: p.id, card: "roadBuilding" });
      const leftover = Math.min(2, p.roadsLeft);
      if (leftover === 0) throw new RuleError("pieces", "Sem estradas para a carta.");
      state.phase = { type: "freeRoads", remaining: leftover, after: state.phase.type === "roll" ? "roll" : "main" };
      log(state, `${p.name} jogou Construção de Estradas.`, p.id);
      return;
    }
    case "PLAY_YEAR_OF_PLENTY": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main" && state.phase.type !== "roll") {
        throw new RuleError("phase", "Jogue a carta durante o seu turno.");
      }
      if (state.playedDevThisTurn) throw new RuleError("one-dev", "Só uma carta por turno.");
      consumeDev(p, action.type);
      state.playedDevThisTurn = true;
      emit({ type: "devPlayed", playerId: p.id, card: "yearOfPlenty" });
      const [r1, r2] = action.resources;
      takeFromBank(state, p, {
        [r1]: r1 === r2 ? 2 : 1,
        ...(r1 === r2 ? {} : { [r2]: 1 }),
      });
      log(state, `${p.name} jogou Ano da Fartura.`, p.id);
      return;
    }
    case "PLAY_MONOPOLY": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main" && state.phase.type !== "roll") {
        throw new RuleError("phase", "Jogue a carta durante o seu turno.");
      }
      if (state.playedDevThisTurn) throw new RuleError("one-dev", "Só uma carta por turno.");
      consumeDev(p, action.type);
      state.playedDevThisTurn = true;
      emit({ type: "devPlayed", playerId: p.id, card: "monopoly" });
      let taken = 0;
      for (const other of state.players) {
        if (other.id === p.id) continue;
        taken += other.resources[action.resource];
        p.resources[action.resource] += other.resources[action.resource];
        other.resources[action.resource] = 0;
      }
      log(state, `${p.name} monopolizou ${recurso(action.resource)} (${taken}).`, p.id);
      return;
    }
    case "END_TURN": {
      const p = assertCurrent(state, action.playerId);
      if (state.phase.type !== "main") throw new RuleError("phase", "Termine o turno só na fase principal.");
      log(state, `${p.name} passou o turno.`, p.id);
      state.tradeOffers = state.tradeOffers.filter((offer) => offer.from !== p.id);
      nextTurn(state);
      return;
    }
    default: {
      const _never: never = action;
      throw new RuleError("unknown", `Ação desconhecida: ${JSON.stringify(_never)}`);
    }
  }
}

function normalize(state: GameState): void {
  if (state.phase.type === "freeRoads") {
    const p = currentPlayer(state);
    const has = Object.values(state.board.edges).some(
      (e) => !e.road && p.roadsLeft > 0 && roadTouchesNetwork(state, p, e.id),
    );
    if (!has) state.phase = { type: state.phase.after };
  }
}

export function reduce(state: GameState, action: Action): ReduceResult {
  const shapeError = actionShapeError(action);
  if (shapeError) return { ok: false, error: { code: "bad-action", message: shapeError } };
  const events: GameEvent[] = [];
  pendingEvents = events;
  try {
    const next = structuredClone(state) as GameState;
    apply(next, normalizeAction(action));
    normalize(next);
    pendingEvents = [];
    return { ok: true, state: next, events };
  } catch (err) {
    pendingEvents = [];
    if (err instanceof RuleError) {
      return { ok: false, error: { code: err.code, message: err.message } };
    }
    throw err;
  }
}

function makeDevDeck(rng: number): { deck: DevCardType[]; rng: number } {
  const cards: DevCardType[] = [
    ...Array<DevCardType>(14).fill("knight"),
    ...Array<DevCardType>(5).fill("victory"),
    ...Array<DevCardType>(2).fill("roadBuilding"),
    ...Array<DevCardType>(2).fill("yearOfPlenty"),
    ...Array<DevCardType>(2).fill("monopoly"),
  ];
  const s = shuffle(cards, rng);
  return { deck: s.items, rng: s.rng };
}

export function createGame(opts: CreateGameOptions): GameState {
  if (opts.players.length < 3 || opts.players.length > 4) {
    throw new Error("Colonos suporta 3 ou 4 jogadores.");
  }
  let rng = opts.seed ?? 0xc07a10;
  const setup = opts.setup ?? "beginner";
  let board = createBeginnerBoard();
  if (setup === "random") {
    const b = createRandomBoard(rng);
    board = b.board;
    rng = b.rng;
  }
  const deck = makeDevDeck(rng);
  rng = deck.rng;

  const players: Player[] = opts.players.map((p, i) => ({
    id: p.id ?? `p${i + 1}`,
    name: p.name,
    color: p.color || COLORS[i]!,
    isBot: p.isBot,
    resources: emptyResources(),
    settlements: [],
    cities: [],
    roads: [],
    devCards: [],
    knightsPlayed: 0,
    settlementsLeft: 5,
    citiesLeft: 4,
    roadsLeft: 15,
  }));

  return {
    board,
    players,
    currentPlayerIndex: 0,
    phase: { type: "setupSettlement", round: 1 },
    dice: null,
    bank: fullBank(19),
    devDeck: deck.deck,
    tradeOffers: [],
    offerSeq: 0,
    offersThisTurn: 0,
    longestRoadPlayerId: null,
    largestArmyPlayerId: null,
    turnNumber: 0,
    rng,
    log: [{ text: "Colonos: coloquem as aldeias iniciais." }],
    playedDevThisTurn: false,
    setup,
  };
}

export function must(state: GameState, action: Action): GameState {
  const r = reduce(state, action);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.state;
}
