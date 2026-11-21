// P3-05: the lifter's name, or a call sign when they skip it. Pure and client-safe (the sign-up form uses it too).
export const NAME_MAX = 12;

// A made-up word identifies nobody, so a call sign is stored as plain text; a typed name is stored sealed (lib/account.ts).
export const CALL_SIGNS = (
  "GRANITE ANVIL FLINT BASALT COBALT TUNGSTEN OBSIDIAN BOULDER SUMMIT RIDGE TIMBER CEDAR BISON KODIAK MAMMOTH HAMMER " +
  "CHISEL RIVET GIRDER PISTON TORQUE DIESEL FORGE CINDER EMBER IRON STEEL CHROME NICKEL ONYX SLATE CANYON GLACIER " +
  "BEDROCK MONOLITH QUARRY KEEL BOLT RAMPART BASTION"
).split(" ");

export const pickCallSign = (except?: string) => {
  const pool = CALL_SIGNS.filter((w) => w !== except);
  return pool[Math.floor(Math.random() * pool.length)];
};

// Trimmed, inner spaces collapsed. Counted in characters as people see them, not UTF-16 units.
export const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");

export function nameProblem(name: string): string | null {
  if ([...name].length > NAME_MAX) return `Use at most ${NAME_MAX} characters.`;
  if (!/^[\p{L}\p{M}\p{N} .'-]+$/u.test(name)) return "Use letters, numbers, spaces, dots, dashes or apostrophes.";
  return null;
}

// P3-08: the brand carries the lifter's name. GO—YOU until there is one (accounts made before P3-05).
export const brand = (name?: string | null) => `GO—${name ?? "YOU"}`;
