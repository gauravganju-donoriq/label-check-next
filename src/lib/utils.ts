import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract the domain from an email address.
 * Used for organization-based access control.
 * @example getEmailDomain("user@acme.com") // returns "acme.com"
 */
export function getEmailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}
