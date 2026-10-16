/** Sent by the crawler and the website check, so site owners can see who is asking. */
export const userAgent = (version: string): string =>
  `PositioningHQ/${version} (+https://parallel79.com/positioninghq/)`
