import { z } from "zod";

export const CONTACT_LIMITS = { name: 100, subject: 150, message: 2000 } as const;

// One line only, as these end up in an email's subject and sender details.
const oneLine = (value: string) => value.replace(/\s+/g, " ");

// Error values are keys into the `contact.errors` messages. The browser and the
// server both apply this schema.
export const contactEnquirySchema = z.object({
  name: z.string().transform(oneLine).pipe(z.string().trim().min(1, "nameRequired").max(CONTACT_LIMITS.name, "nameTooLong")),
  email: z.email("emailInvalid"),
  subject: z.string().transform(oneLine).pipe(z.string().trim().min(1, "subjectRequired").max(CONTACT_LIMITS.subject, "subjectTooLong")),
  message: z.string().trim().min(1, "messageRequired").max(CONTACT_LIMITS.message, "messageTooLong"),
});

export const contactRequestSchema = contactEnquirySchema.extend({ website: z.literal("").optional() }).strict();

export type ContactEnquiry = z.infer<typeof contactEnquirySchema>;
