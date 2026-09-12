// InsumoSync: Utilitários de Ordenação de Listas
// Author: frontend-engineer

export type SortDirection = 'asc' | 'desc';

export interface SortOption<T extends string = string> {
  value: T;
  label: string;
}

/**
 * Ordena uma **cópia** da lista, preservando o array original.
 *
 * Regras de comparação:
 * - Números comparam numericamente.
 * - Textos usam `localeCompare` em `pt-BR`, de modo que acentuação e maiúsculas
 *   não bagunçam a ordem alfabética ("Água" vem antes de "Batata").
 * - A opção `numeric` faz "Caixa 10" vir depois de "Caixa 9", e não antes.
 * - Valores ausentes (`null`, `undefined` ou string vazia) vão **sempre para o
 *   fim**, independentemente da direção: um item sem o dado não é o menor de
 *   todos, ele simplesmente não tem o dado.
 */
export function sortItems<Item>(
  items: Item[],
  accessor: (item: Item) => string | number | null | undefined,
  direction: SortDirection
): Item[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);

    const aEmpty = va === null || va === undefined || va === '';
    const bEmpty = vb === null || vb === undefined || vb === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * factor;
    }

    return (
      String(va).localeCompare(String(vb), 'pt-BR', {
        sensitivity: 'base',
        numeric: true,
      }) * factor
    );
  });
}

/** Converte uma data ISO em número comparável. Data inválida vira ausente. */
export function dateValue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}
