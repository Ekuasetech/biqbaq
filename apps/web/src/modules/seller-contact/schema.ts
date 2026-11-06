import { z } from "zod";

export const CONTACT_LIMITS = { name: 100, subject: 150, message: 2000 } as const;

// Error values are keys into the `contact.errors` messages. The server must
// apply this same schema when sending is connected in Phase 4.
export const contactEnquirySchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(CONTACT_LIMITS.name, "nameTooLong"),
  email: z.email("emailInvalid"),
  subject: z.string().trim().min(1, "subjectRequired").max(CONTACT_LIMITS.subject, "subjectTooLong"),
  message: z.string().trim().min(1, "messageRequired").max(CONTACT_LIMITS.message, "messageTooLong"),
});

export type ContactEnquiry = z.infer<typeof contactEnquirySchema>;
