import * as z from 'zod';

export const profileSchema = z.object({
  name: z.string().trim().min(3, { message: 'Too few characters in the name!' }).max(64, { message: 'Too much characters in the name!' }),
});

const text = (label: string, max = 120) =>
  z.string().trim().min(1, { message: `${label} is required` }).max(max, { message: `${label} is too long` });

export const addressSchema = z.object({
  label: text('Label', 40).default('Home'),
  street: text('Street'),
  number: text('Number', 20),
  complement: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  city: text('City', 80),
  state: text('State', 80),
  zip_code: text('ZIP code', 20),
  country: text('Country', 60).default('BR'),
});
