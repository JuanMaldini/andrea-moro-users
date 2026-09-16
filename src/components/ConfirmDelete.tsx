"use client";

interface Props {
  /** Qué se está por borrar, p. ej. "esta foto" o el nombre del archivo. */
  what: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Aviso de confirmación que tapa la miniatura. Se usa en las grillas de fotos
 * y recursos: borrar un archivo no tiene vuelta atrás, así que nunca pasa
 * con un solo toque.
 */
export default function ConfirmDelete({ what, onConfirm, onCancel }: Props) {
  return (
    <div className="absolute inset-0 z-10 bg-negro/75 flex flex-col items-center justify-center gap-2 p-2">
      <p className="text-blanco text-[11px] font-semibold text-center leading-tight break-words">
        ¿Eliminar {what}?
      </p>
      <p className="text-blanco/70 text-[9px] text-center leading-tight">
        No se puede deshacer
      </p>
      <div className="flex gap-2 mt-0.5">
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-1 bg-rojo text-blanco text-xs font-bold rounded hover:opacity-85 transition-opacity"
        >
          Sí, borrar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 bg-blanco text-negro text-xs font-bold rounded hover:bg-grisoscuro transition-colors"
        >
          No
        </button>
      </div>
    </div>
  );
}
