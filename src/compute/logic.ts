/** Logic gates for the last compute scale: a full adder built from nine NAND gates. */
export const nand = (a: number, b: number): number => (a & b) ^ 1;

/** One NAND: its two input nets (the gate's own output net is its id). */
export interface Gate {
  id: string;
  a: string;
  b: string;
}

/**
 * The classic nine-NAND full adder. Nets `a`, `b`, `cin` are inputs; `n8` is the sum and `n9`
 * the carry out. n4 = a XOR b.
 */
export const FULL_ADDER: readonly Gate[] = [
  { id: 'n1', a: 'a', b: 'b' },
  { id: 'n2', a: 'a', b: 'n1' },
  { id: 'n3', a: 'b', b: 'n1' },
  { id: 'n4', a: 'n2', b: 'n3' },
  { id: 'n5', a: 'n4', b: 'cin' },
  { id: 'n6', a: 'n4', b: 'n5' },
  { id: 'n7', a: 'cin', b: 'n5' },
  { id: 'n8', a: 'n6', b: 'n7' },
  { id: 'n9', a: 'n1', b: 'n5' },
];

/** Every net's value for the given inputs. */
export function evalFullAdder(a: number, b: number, cin: number): Record<string, number> {
  const net: Record<string, number> = { a, b, cin };
  for (const g of FULL_ADDER) net[g.id] = nand(net[g.a], net[g.b]);
  return net;
}

/** A CMOS NAND2 has 2 PMOS in parallel (pull-up) and 2 NMOS in series (pull-down). */
export const TRANSISTORS_PER_NAND2 = 4;
