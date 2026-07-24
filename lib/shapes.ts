// Shape definitions and transforms live in the shared puzzle module so the
// Supabase edge function validates with exactly the same code. Re-exported
// here to keep client import paths unchanged.
export {
  SHAPES,
  flipShape,
  normalizeShape,
  rotateShape,
} from "../supabase/functions/_shared/puzzle";
