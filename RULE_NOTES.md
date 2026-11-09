# Rule notes

These are the places where the rulebook PDF (base v1.0 + War Expansion v0.2) and the build prompt were unclear or disagreed, and what the game does about each one. The team approved every answer below on 9 November 2026.

Any number mentioned here can be changed in `config.js` (defaults) or in the lobby (one game).

## Where the prompt overrides the PDF

| Topic | PDF says | Game does (prompt) | Setting |
|---|---|---|---|
| Base game length | 5 rounds | **7 rounds** | `base.rounds` |
| Sustainable (Base) | collect any 2 materials | **2 of your home resource** (Mixed: any 2) | `base.sustainableCollect` |
| Scoring | spare tokens only | **spare materials + seawall points** | `base.seawallPointsPerMaterial` |
| Storm ending | not in PDF | optional, **off by default**; from round 6, roll at the end of each round, 1–2 ends the game | `base.stormEnabled`, `base.stormFromRound`, `base.stormEndMax` |
| Sanctions (War) | can't trade or use the market | also **can't give or receive gifts** | — |

## Base game

- **Q1 — Picking materials.** Unsustainable (any 4) and Mixed Sustainable (any 2) need a mix. You pick the mix secretly along with your action card.
- **Q2 — Raid loot.** The winning raider picks which tokens to take, using a picker on screen. If they don't pick within **30 seconds**, the tokens are chosen at random. If the defender has 3 or fewer tokens, or only one kind of material, there is no real choice, so the tokens are taken automatically. *Setting:* `general.lootPickSeconds`.
- **Q3 — Raider out of wood.** If a raider has no wood left when their raid comes up (for example, an earlier raid took it), the raid fizzles. Nobody pays anything and nothing happens.
- **Q4 — Biomes.** By default: one each of Forest, Quarry and Riverbank. From 4 players one player is Mixed, and with 5 players there is one random repeat (Forest, Quarry or Riverbank). Seats get these at random. The host can switch to "Host picks" in the lobby and set every biome by hand.
- **Q5 — Catastrophe and seawall.** Catastrophe happens when the Flood **is at or above** the threshold, checked straight after collection. Seawall donations are counted for the whole table: every **6** donated in total (by anyone) gives **+1** to the threshold, up to **+3** per game. *Settings:* `base.seawallPerStep`, `base.seawallMaxSteps`.
- **Q6 — Protection cap.** The PDF caps "effective protection" at the final Flood. Walls never score points, so the cap changes nothing, and it isn't used. A home survives if protection ≥ final Flood.

### Smaller decisions (not in the original list)
- **Ready in both build phases.** Base mode keeps both Trade & Build phases from the rulebook: step 5 of one round and step 1 of the next. Everyone presses Ready in each.
- **Changing your action.** You can change your secret action until the last player locks in. Then all actions are revealed at once.
- **Trade offers** are checked again when accepted: both players must still have the materials. Open offers are cancelled when the Choose phase starts.
- **Hidden materials** (`general.hideOtherMaterials`, off by default) hide other players' exact stockpiles and show only their total. The event log still shows trades, gifts and loot. It is a table-talk game, and anyone at the table would see those moves.
- **"End game" (host)** scores the game at the current Flood, as if it were the last round.
- **Skipping a player (host)**: in a build phase it marks them Ready. In the Choose phase it plays Sustainable for them (Mixed: an even mix). While they're picking loot, it picks at random.
- **Host handover.** If the host is disconnected for **60 seconds**, the first connected player becomes host. A quick page refresh doesn't lose host. *Setting:* `general.hostHandoverSeconds`.

## Board (War modes)

- **Q7 — Board layout.** The 19-hex board can't fit the PDF's territory description. The PDF's "12 player tiles + 3 open tiles" was an error. Each territory is a wedge: **1 inner-ring province, 1 outer-ring province, and the capital on an outer corner**. All three touch each other. With 4 players there are **6 open tiles**. Layouts are data in `engine/layouts.js`, so you can try other layouts without changing any game code.
- **Q8 — Open tiles.** Open tiles can be claimed. To claim one, choose Attack and target an open tile next to one you control. You win automatically and the attack adds +1 Flood as normal, but there is **no loot and no sanction** (nobody was invaded). Once claimed, the tile counts as occupied: it produces for you, and you count as an occupying player for the +1 Flood per round. The host can make open tiles impassable instead. *Setting:* `war.openTilesClaimable`.
- **Q9 — Mixed player in War.** Their two home tiles each produce any 1 material.
- **Q10 — Thresholds.** War catastrophe threshold: 20 for 4 players (from the PDF). 19 for 3 players and 21 for 5 are placeholders. *Settings:* `war.catastrophe.3/4/5`.

## War mode

- **Q11** The player currently holding a tile defends it. If an occupier loses a tile, they lose the loot and become Damaged.
- **Q12** A capital can be attacked once both of its provinces are occupied by anyone, not only the attacker.
- **Q13** Upkeep is paid automatically from your largest pile of materials. If you can't pay, units are disbanded automatically until you can.
- **Q14** Damaged lasts until your next Sustainable or Unsustainable action, even if you attack in between.
- **Q15** Sanctions start when the attack is resolved and last until the end of the next round. If the attack's own +1 Flood breaks the Accord at reveal, there is no sanction. If the Accord breaks while a sanction is running, the sanction ends at the end of that round (PDF W6).
- **Q16** International aid is checked against the Flood **before** this round's increases. You pick which material the extra one is.
- **Q17** A clash happens only when two players attack each other. Three-way loops are resolved one by one, clockwise. The clash winner gets the normal win effects (occupy, loot, Damaged).
- **Q18** An attacker with 0 units when their battle comes up (they lost units defending earlier) fizzles. Their +1 Flood still counts.

## Empire mode

- **Q19** Capturing a capital takes **half the stockpile (rounded down)** *instead of* 3 tokens. The puppet is not Damaged. Anyone occupying the puppet's provinces loses them, including third parties.
- **Q20** Tribute is half of everything the puppet collects (aid included), **rounded up**. The overlord gets the material types the puppet just collected, largest pile first.
- **Q21** PDF W8.2 "production access" is included, with an on/off setting. *Setting:* `empire.productionAccess`.
- **Q22** If the overlord sets no command by the end of Talk & Build, the puppet's command is Sustainable.
- **Q23** Revolts ignore adjacency but need at least 1 unit. If the overlord has 0 units, the rebel wins.
- **Q24** For a commanded attack, the **overlord** is sanctioned, not the puppet. When the overlord adds units, the **puppet's units are lost first**. (The PDF says the overlord chooses which units are lost; this keeps the game moving.)
- **Q25** Garrison costs are 1 / 3 / 6 for 1 / 2 / 3 puppets, and **10** for 4. If the overlord can't pay, the most recently captured puppet is freed first. *Settings:* `empire.garrisonCost.*`.

## Decisions made while building War and Empire (not in the original list)

These came up during the build. Each one is the simplest reading I could find; change any you disagree with.

**Upkeep and occupation**
- **Withdrawing and freeing are planned ahead.** During a Talk & Build or Trade & Build phase you can mark an occupied tile "withdraw at next upkeep" (or a puppet "free at upkeep"). It happens at the start of the next round, *before* the occupation Flood is counted, so withdrawing saves the +1. This avoids an extra phase where everyone has to press Ready.
- **Upkeep order:** planned withdrawals and releases → militia upkeep → garrison → Flood +1 per occupying player → check the Accord and catastrophe. Because militia is paid first, a big army can leave you unable to pay the garrison, and then a puppet goes free.
- **Damaged** takes the lost material from the largest pile of what you collect.
- Sanctioned players can still recruit, build walls and donate to the seawall. Only trading, gifts and the market are blocked.

**Battles**
- A **sanction** applies whether the attack wins or loses. An attack that fizzles (no units, target already yours) is not sanctioned.
- **Retaking your own tile** works like any province win, as in Q11: the occupier loses up to 3 tokens and becomes Damaged. You are not sanctioned.
- **A tile someone has claimed** from the open tiles can be attacked like a province. That *is* sanctioned, since a player is being invaded.
- **Clashes:** each side is treated as an attacker for sanctions. The winner gets the normal win effects for the tile they targeted.
- **The capital's extra defence die also applies in a revolt.** The PDF calls a revolt "a normal attack" on the capital.

**Empire**
- **Commanded militia is automatic.** An overlord's attacks and defences always include their puppets' units (puppets' units are lost first). A puppet defending in a proxy war automatically gets its overlord's units too.
- A **commanded attack** uses only the puppet's own units. The puppet can't be commanded to attack its overlord or the overlord's other puppets, and an overlord can't attack its own puppets.
- If a command can't be carried out when choosing (for example, the puppet has no units left), the puppet plays Sustainable.
- **Production access** (Q21): an overlord's Sustainable income can be taken as any mix of the materials their own tiles *or* their puppets' tiles produce. The total stays the same.
- **Tribute** is taken after Damaged and aid, from what the puppet just collected (largest pile first).
- A puppet with 0 units can't revolt.

**Game end:** the optional Storm ending (Base settings) also works in War modes. The PDF leaves the War ending open.
