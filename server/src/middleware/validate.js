// Validates req.body against a Zod schema. On failure: 422 with field-level errors.
// On success: replaces req.body with the cleaned, typed data.
export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({
      error: "Validation failed",
      details: parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  }
  req.body = parsed.data;
  next();
};