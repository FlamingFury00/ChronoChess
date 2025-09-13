# Features Implemented

## Evolution and Abilities

- Knight Dash: Knights can use extended L-shape moves with a dash ability and cooldown tracking.
- Rook Entrenchment: Rooks gain defensive bonuses and extended range after staying stationary for 3 turns.
- Bishop Consecration: Bishops can consecrate surrounding squares after staying stationary for 3 turns.
- Queen Dominance: Queens exert control over a larger radius, influencing enemy evaluations.

### Pawn Balance Update

- Enhanced March (extra forward movement) is limited by usage and cooldown:
	- Default: one-time use (maxUses: 1) and gated by 4 plies move-cooldown.
	- Only generates the 2-square forward push when available; otherwise behaves like a normal pawn.
- Breakthrough (diagonal non-capture sidestep) is reduced in power and gated:
	- Only a single-square diagonal step without capture (no multi-square diagonals).
	- Default: limited to 2 uses per pawn with a 6-plies move-cooldown between uses.
- Move generation and validation both respect availability, preventing pawn rushes directly toward the king.

