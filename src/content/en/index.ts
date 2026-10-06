import { ui } from './ui';
import { card } from './card';
import { pcb } from './pcb';
import { pkg } from './package';
import { die } from './die';
import { metal } from './metal';
import { transistor } from './transistor';
import { lattice } from './lattice';
import { atom } from './atom';
import { nucleus } from './nucleus';
import { story } from './story';
import { accuracy } from './accuracy';
import { reference } from './reference';
import { memory } from './memory';

export const en = {
  ui,
  story,
  accuracy,
  reference,
  memory,
  levels: { card, pcb, package: pkg, die, metal, transistor, lattice, atom, nucleus },
};
