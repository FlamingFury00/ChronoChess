## System Status Notes

### Manual Mode: Stalemate Suppression
- Status: Fixed
- Date: 2025-09-14
- Details: Stalemate was being triggered too early during Manual Play. The chess engine now suppresses stalemate-only game overs while Manual Mode is active. Checkmate remains a valid end condition. This is toggled via `ChessEngine.setManualMode(true|false)` and wired from the store (`startManualGame`/`endManualGame`). UI will no longer display "Stalemate" during manual sessions.

