import { compileBook } from "./api";
/** The compiled Wish Book is a saved snapshot. After a relevant change, refresh it once, quietly. Never called from a render. */
export const recompileQuietly = (id: string): Promise<boolean> => compileBook(id).then(() => true, () => false);
