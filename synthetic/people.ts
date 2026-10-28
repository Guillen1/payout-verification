import type { SeededRandom } from "./random";

const FIRST_NAMES = [
  "Maria",
  "James",
  "Ana",
  "Robert",
  "Linda",
  "Carlos",
  "Patricia",
  "David",
  "Sofia",
  "Michael",
  "Grace",
  "Luis",
  "Emily",
  "Daniel",
  "Rosa",
  "Kevin",
  "Hannah",
  "Jorge",
  "Olivia",
  "Samuel",
  "Elena",
  "Brian",
  "Lucia",
  "Thomas",
  "Megan",
  "Diego",
  "Rachel",
  "Andre",
  "Nina",
  "Victor"
];

const LAST_NAMES = [
  "Lopez",
  "Carter",
  "Kim",
  "Nguyen",
  "Patel",
  "Garcia",
  "Johnson",
  "Brooks",
  "Rivera",
  "Walsh",
  "Ortiz",
  "Bennett",
  "Chen",
  "Foster",
  "Ramirez",
  "Hughes",
  "Morales",
  "Price",
  "Sullivan",
  "Reyes",
  "Coleman",
  "Flores",
  "Hayes",
  "Castillo",
  "Graham",
  "Vargas",
  "Wallace",
  "Mendoza",
  "Ford",
  "Silva"
];

/** Hands out invented insured names, never the same one twice. */
export class NamePool {
  private readonly used = new Set<string>();

  constructor(private readonly random: SeededRandom) {}

  next(): { first: string; last: string } {
    for (let attempt = 0; attempt < 1_000; attempt++) {
      const first = this.random.pick(FIRST_NAMES);
      const last = this.random.pick(LAST_NAMES);
      if (!this.used.has(`${first} ${last}`)) {
        this.used.add(`${first} ${last}`);
        return { first, last };
      }
    }
    throw new Error("Ran out of unique names");
  }
}
