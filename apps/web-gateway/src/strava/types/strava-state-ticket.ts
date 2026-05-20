/**
 * Discriminated union recording the *intent* of a Strava OAuth round-trip when
 * the state ticket is minted. Variants live together because they only make
 * sense as alternatives of the same union.
 */
export type StravaStateTicket =
  | { kind: 'link'; userId: string }
  | { kind: 'signin' }
