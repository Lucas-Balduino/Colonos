import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

const PAGES = [
  {
    title: "Objetivo",
    body: "Chegue a 10 pontos. Cada aldeia vale 1 e cada cidade vale 2. A maior estrada e o maior exército valem 2 cada.",
  },
  {
    title: "Fundação",
    body: "Cada pessoa funda duas aldeias e duas estradas. Na segunda aldeia, os terrenos vizinhos entregam uma carta cada.",
  },
  {
    title: "Turno",
    body: "Role os dados. Quem tem casa naquele número recebe recursos. Depois troque, construa ou encerre o turno.",
  },
  {
    title: "Ladrão",
    body: "No 7, quem tem mais de 7 cartas descarta a metade. O ladrão bloqueia um terreno e rouba uma carta de um vizinho.",
  },
  {
    title: "Cartas",
    body: "Cavaleiro move o ladrão. Fartura pega duas cartas do banco. Monopólio toma um recurso. Estradas abre dois caminhos. A carta de ponto fica oculta até o fim.",
  },
] as const;

export function HowToPlay() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const current = PAGES[page] ?? PAGES[0];

  return (
    <>
      <button
        type="button"
        aria-label="Como jogar"
        className="pixel-btn bg-secondary grid size-8 place-items-center text-sm"
        onClick={() => {
          setPage(0);
          setOpen(true);
        }}
      >
        ?
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-[#8a6410] bg-[#3d2a1f] text-[#f4e8c8]" showCloseButton>
          <DialogHeader>
            <DialogTitle>{current.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">{current.body}</p>
          <p className="text-muted-foreground text-xs">
            {page + 1} de {PAGES.length}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
              Anterior
            </Button>
            <Button disabled={page === PAGES.length - 1} onClick={() => setPage((value) => value + 1)}>
              Seguinte
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
