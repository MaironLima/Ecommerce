import z from 'zod';

export const reviewSchema = z.object({
  rating: z.coerce
    .number()
    .int({ message: 'Rating must be a whole number' })
    .min(1, { message: 'Rating must be between 1 and 5' })
    .max(5, { message: 'Rating must be between 1 and 5' }),
  title: z
    .string()
    .trim()
    .min(3, { message: 'Too few characters in the title!' })
    .max(64, { message: 'Too much characters in the title!' }),
  comment: z
    .string()
    .trim()
    .max(600, { message: 'Too much characters in the comment!' })
    .optional(),
});
