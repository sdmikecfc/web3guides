/**
 * ARCADE OVERRIDES FOR THE SEASON GAME SHELLS.
 *
 * Every season RunShell merges `{...DEFAULT_STRINGS, ...strings}`; in the
 * arcade it spreads this object LAST, so it wins over both. The defaults it
 * replaces talk about season points (Valor, Signal, Medals), play currency,
 * "Enlist", runs per day, and in S7 a cash prize at settlement. None of that
 * is true in the arcade: nothing is paid, nothing carries into a season, and
 * runs are unlimited.
 *
 * COPY LAW: plain words for a global audience, no idioms, no em-dashes, never
 * a money figure, never "win". No {points} or {player} tokens in here: the
 * shells fill those from a season theme const, and an unknown token would
 * print raw. Keys a given season does not have are simply ignored.
 */
export const ARCADE_SHELL_STRINGS: Record<string, string> = {
  // result panel
  bankedPlus: "Your best score today is on the arcade board.",
  bankedAlready: "Your best score today is on the arcade board.",
  newBest: "New best today!",
  noImprove: "No improvement on today's best.",
  attemptsLeft: "",
  dailyRoomLeft: "",
  sprintNote: "",
  // Arcade runs are unlimited for a signed-in player, so the only place this
  // can still show is under a guest's last parked run of the day.
  lastRun: "That was your last guest run today. Sign in below and your runs go on the board.",
  leaderNote: "",
  classXpNote: "",
  levelUpNote: "",
  copyDone: "Copied. Paste it anywhere.",
  // guest play
  guestParked:
    "Guest run. Best in this browser: {best}. Guest scores are not saved to the board. Sign in below and your next runs count.",
  guestSpent: "Guest runs for today are used. This one was practice. Sign in below to put scores on the board.",
  guestHeading: "Playing as a guest",
  guestBody:
    "You are playing as a guest{leftNote}. Guest scores are not saved. Connect a wallet and sign once, no gas, and your next runs go on the board.",
  guestLeftNote: " ({n} guest {runWord} left today)",
  guestClaimed: "",
  // session panel
  sessionOpen: "Signed in. Your best score in each game goes on the arcade board.",
  signBank: "Sign in to save your scores",
  // footers
  footReal:
    "The arcade is for fun. Scores here pay nothing and do not carry into a season. Play as many runs as you like: your best score in each game goes on the board.",
  footPractice: "Practice arena. Scores here never save.",
  arcade: "‹ Arcade",
};
