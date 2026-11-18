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

## Stationed units (added 9 November 2026, on by default)

The team asked for units to be stationed on tiles, like Risk, instead of one army that defends everywhere. Setting: `war.stationedUnits` (lobby: "Units are stationed on tiles"). Turn it off to play the PDF's rules.

**Agreed with the team**
- Every unit stands on a tile you control. Starting units stand on your capital.
- **Moving:** during either Trade & Build phase, move units between your tiles as often as you like, any distance. They can only travel through tiles you control (in Empire, also your puppets' tiles). Moves are public.
- **Attacking:** choose the target, one of your tiles next to it, and how many units to send from that tile. **Nobody has to stay behind.** You roll 1 die per unit sent (max 3).
- **Defending:** only the units on the attacked tile defend (max 2 dice, +1 on a capital). **An empty tile loses automatically.**
- **Winning a province:** the surviving attackers move into it. **Losing:** survivors go back to the tile they came from.
- Clashes: only the units each side sent fight.
- Claiming an open tile needs at least 1 unit sent, and those units stay there.
- Withdrawing from a tile sends the units on it back to your capital.
- Disbanding (unpaid upkeep) removes units from your biggest stack first.

**Decided while building (please check)**
- **Recruiting:** you choose which of your tiles the new units appear on (default: your capital).
- **Surviving defenders retreat.** If a province is lost while some of its defenders survive (e.g. 1 attack die beats the higher of 2 defence dice), they step to an adjacent tile their owner controls. If there is none, they are lost.
- **Capitals are never occupied.** Attackers who win at a capital go back to the tile they came from. In War, the capital's owner keeps any surviving defenders.
- **Empire capture:** units on the fallen capital are destroyed. A third player's units occupying its provinces go back to their own capital. The new overlord's units may stay, because overlords may stand on puppet tiles.
- **Proxy-war help:** an overlord can move units onto a puppet's tile, and they defend it alongside the puppet's units (puppet's units are lost first). When the puppet is freed, those units go back to the overlord's capital.
- **Commanded attacks** use the puppet's units. If they win a province, it goes to the overlord *empty*: the puppet's units go back home, and the overlord has to move units in to hold it.
- **Revolts** are launched from any one of the puppet's tiles (adjacency is still ignored). The overlord defends with their own units on their capital only.
- Overlords no longer add puppet units to their own attacks: units only fight where they stand.
- An attack fizzles if the tile it was launched from was lost earlier in the same round.
- In a clash, if the loser's starting tile is the one the winner just took, the loser's survivors retreat from it.

## Making war tempting (added 9 November 2026)

After a playtest where a full 8-round rush only took three tiles and pushed the Flood to 15, the team changed the War economy. Each change is a lobby setting.

| Change | Was (PDF) | Now | Setting |
|---|---|---|---|
| **Tile income** | Sustainable 1 per tile, Unsustainable 2 per tile, Attack nothing | **Every tile you hold gives 1 of its resource every round, whatever you play** (Attack included) | `war.passivePerTile` |
| **Sustainable** | 1 per tile | tile income **+2 of your home resource** | `war.sustainableBonus` |
| **Unsustainable** | 2 per tile, any mix | tile income **+6, any mix**, Flood +1 | `war.unsustainableBonus` |
| **Occupation Flood** | +1 per occupying player per round | **0** | `war.occupationFlood` |
| **Capitals** | attackable once **both** provinces are occupied | once **one** province is occupied | `war.capitalOpensAfter` |
| Attack Flood | +1 per attack | unchanged: +1 per attack | `war.attackFlood` |

Example for a player with 3 tiles: Attack collects 3, Sustainable 5, Unsustainable 9. Every tile you conquer raises your income in every round, including rounds you attack.

**Decided while building (please check)**
- **Mixed tiles** give the material you currently hold least of. They no longer let you pick, because tile income now arrives even when you attack.
- **A Mixed home** picks its 2-material Sustainable bonus freely.
- **Damaged** now takes 1 off your next round's income, whatever you play. The old wording ("next development") stopped making sense now that attacks also collect. This replaces Q14.
- **International aid** is still only paid when you develop (Sustainable or Unsustainable).
- **Tribute** is half of everything a puppet collects, including tile income in rounds the puppet attacks.
- **Production access** applies to the Sustainable bonus only. Tile income always matches each tile's own resource.

## War can never be sustainable (added 9 November 2026)

With tile income, a growing empire paid the same Flood per round as a small one, so war could become "sustainable". The team added two Flood costs that grow with the size of the war. Both are lobby settings, and 0 switches them off.

| Rule | Real-world basis (PDF W10) | Default | Setting |
|---|---|---|---|
| **Army emissions:** at each upkeep, Flood +1 for every 5 units a player owns (rounded down). 1–4 units cost nothing; 11 units cost +2 every round. | Militaries ≈ 5.5% of global emissions | 1 per 5 units | `war.armyFloodPerUnits` |
| **Destruction:** every 2 units destroyed in battle (either side) add Flood +1, on top of the attack's +1. Odd losses carry over to the next battle. | Fighting was 36% of the war's emissions | 1 per 2 units | `war.destructionFloodPerUnits` |

**Decided while building (please check)**
- Army emissions are counted **after** militia upkeep, so units disbanded for unpaid upkeep don't pollute.
- Units count as "destroyed" whenever they're lost in battle, including defenders with nowhere to retreat and units on a captured capital. Units disbanded for unpaid upkeep don't count.
- Destruction Flood is added right after each battle. If it causes a catastrophe, the game ends immediately and the remaining battles that round don't happen.
- The playtest record now includes Flood from armies and from destruction, plus each player's army emissions.

## Diplomacy: pacts and treaties (added 10 November 2026)

**Pacts (always available; setting `general.pactsEnabled`).** The rulebook says promises are never binding, so the game doesn't enforce pacts. It records them publicly.
- During either Trade & Build phase, offer a player a **non-aggression pact** (no raids or attacks on each other) or an **alliance** (the same, plus a named shared enemy) for 1–3 rounds (`general.maxPactRounds`).
- Offers are private between the two players. Active pacts are visible to everyone.
- A pact made before choosing covers the current round. Unanswered offers lapse at the end of the round.
- **Breaking a pact** means raiding or attacking your partner, including in a clash. It's allowed, but the log announces "⚠ X BROKE their pact with Y", and X carries a public 🗡 "broke a pact" mark for the rest of the game.
- When a pact runs out without being broken, both players get a "pact kept" in the record.
- The game remembers who has raided or attacked whom (shown to bots, which hold grudges).

**Treaties (off by default; setting `general.treatiesEnabled`).** A treaty is a set of rules the game can check, and it **is** enforced.
- Rules available:
  - no more than N militia each (War modes only);
  - no Unsustainable development;
  - no raids or attacks on fellow signatories;
  - no raids or attacks at all.
- A treaty can also have a name and a note. The note is shown but not enforced.
- The proposer signs first and invites others. The treaty comes into force once 2 players have signed. It lasts a set number of rounds, or the rest of the game.
- **While you're a signatory, the game blocks any move that breaks the rules.** You can't sign a militia treaty while you're over its limit.
- **Leaving early means breaking it:** you're freed from it, marked publicly ("broke a treaty"), and lose `general.treatyBreakPenalty` materials (default 3, taken from your biggest piles). A treaty ends when fewer than 2 signatories remain.

**Decided while building (please check)**
- **Claims and revolts count as attacks** for "no attacks" treaties. Claiming an empty open tile breaks no pact, because no player is attacked.
- **A puppet's treaty beats its overlord's command:** if the command would break the puppet's treaty, the puppet plays Sustainable instead.
- **Militia limits only block recruiting.** Units you already have never break a treaty, and you can't sign a militia treaty while above its limit.
- Pacts and treaties are handled during Trade & Build phases only, the same as trading.

**Bots and diplomacy.** Bots answer pact offers and treaty invitations based on personality and trust. They trust players who broke pacts or attacked them less. They offer pacts: cautious and balanced bots seek peace with the strongest neighbour, and warlike bots seek alliances against the leader. They usually honour pacts (cautious about 98% of the time, warlike about 60%). They send trade offers when they need a material, and they chat: reacting to attacks, broken pacts and a dangerous Flood, and answering simple messages that mention them or "everyone" (keywords: pact/peace, trade, attack, flood, hello).

## Puppets going free (fixed 10 November 2026)

A playtest saw a puppet "suddenly" go free with no revolt. That was the Empire rule working as written (Q25): **if the overlord can't pay the garrison at the start of a round, the puppet is freed**, and any overlord units on its tiles go home. But bot overlords spent everything and almost never kept a garrison (333 of 344 freed puppets in 150 test games), and the one log line was easy to miss. Now:
- Bots keep enough materials back for next round's militia upkeep and garrison.
- A freed puppet, a broken pact or a broken treaty pops up on everyone's screen and is highlighted in the log.
- A puppet's panel shows whether its overlord can afford the garrison ("not enough: you will go free unless they get more!"). Gifting materials to the puppet doesn't help, but draining the overlord's materials does.

## Smarter bots: treaties judged on the situation (10 November 2026)

Bots, warlike ones included, now decide on treaties from the state of the game, not just their personality:
- **"No Unsustainable"**: signed when the Flood is within 5 of catastrophe or the bot's own walls can't hold the current Flood. A safe warlike bot may still refuse, because Unsustainable funds its army.
- **Militia limits / no attacks**: refused only when the bot has **expansion plans**, meaning a winnable target next to its units (open tile, under-defended tile). With no conquest in reach, warlike bots sign. "No attacks on each other" is refused only if one of the signatories is the bot's target.
- When the village is about to drown (within 3), bots sign green treaties even from players they distrust.
- Warlike bots break a militia treaty only when a real conquest appears, and never when the Flood is dangerous.
- Any bot, not just cautious ones, proposes a "Green Pledge" (no Unsustainable for 2 rounds) when the Flood threatens its own home.
- Allies prefer attacking and raiding their alliance's named enemy.
- Bots skip Unsustainable when their own home is at risk, and warlike bots stop growing their army past the army-emissions size once the Flood is within 8 of catastrophe.

In 60 bot-only War games this cut catastrophes from about 15–20 to 8 (3 with treaties on), and warlike bots survived about 18% of the time instead of 1–4%.

## ⚔ Total War mode (added 11 November 2026, just for fun)

A separate fourth mode where war is the point. Base, War and War + Empire are unchanged. Every number is in `config.js` under `totalwar` and in the lobby.

**The strategic game** (built on the War rules with stationed units)
- **18 rounds.** Light Flood: no Accord, sanctions or aid; no army, destruction or occupation Flood. Each real battle adds Flood +1 (claiming empty land is free), and the catastrophe line is much higher (28 / 30 / 32 for 3 / 4 / 5 players).
- **Opening truce:** for the first 2 rounds nobody can attack another player. Claiming empty land is still allowed, so the opening is for expanding, researching and recruiting. (`truceRounds`; 0 turns it off.)
- **Unit types:**

  | Type | Cost | Upkeep pts | HP | Damage/s | Speed | Notes |
  |---|---|---|---|---|---|---|
  | ● Militia | 2 | 1 | 10 | 1 | 3 | cheap |
  | ■ Infantry | 4 | 1 | 18 | 1.5 | 2.5 | tough; stands firm against cavalry |
  | ▲ Cavalry | 5 | 2 | 12 | 1.5 | 5 | fast; 150% damage vs militia, 70% vs infantry — but **150% vs encircled (cut-off) infantry**, before the 175% cut-off penalty; slow in forests |

  Upkeep: 1 material per 4 upkeep points. Everyone starts with 2 militia on their capital.
- **War profiteering:**
  - Conquered tiles give **+1 plunder income** every round, on top of normal tile income.
  - Winning a tile gives **up to 6 tokens of loot**, taken automatically, plus **3 materials of war spoils** from the bank.
  - **Capitals can be captured and held.** Their owner keeps playing and can try to win them back.
  - A capital opens to attack once 1 of its provinces has fallen.
  - Holding **every capital** ends the game at once.
- **Score after 18 rounds:**
  - 2 points per tile held;
  - +3 for each enemy capital held;
  - 1 point per 3 spare materials;
  - +5 if your own capital is still yours and above the Flood.
  - A catastrophe means everyone scores 0.

**Live battles**
- Claiming empty land or marching into an undefended tile needs no battle. An attack on defended land starts a **real-time battle** on a 60×40 map.
  - **Terrain** comes from the two tiles: forests and hills protect (130% / 140%); a river crosses the map when a Riverbank tile is involved, and is slow except at its two fords.
  - **Positions:** attackers enter from the left edge. Defenders start around the flag: infantry on it, militia in front, cavalry behind.
  - **Controls:** tap your units (or *Select all / Militia / Infantry / Cavalry*), then tap where to go.
  - **Contact:** units in contact fight, and move at a third of their speed while engaged.
  - **Flanking:** a unit hit from two directions more than 100° apart takes 140% damage.
  - **Encirclement:** every half second, each unit must be able to trace a path to its own side's map edge (attackers: left, defenders: right) without crossing enemy-controlled ground (within 4 squares of an enemy unit). Units that can't are **cut off**: they take 175% damage, deal 75%, and **surrender after 8 seconds**. When a battle ends, the loser's cut-off units are captured.
  - **Winning:** the attacker wins by holding the flag **alone** for 8 seconds or destroying every defender. The defender wins by destroying the attackers or **holding out for 90 seconds**.
  - **Afterwards:** winning attackers move into the tile. Surviving defenders retreat to a neighbouring tile, or are lost. A losing attack's survivors go home.
- **Waves:** all battles in a round run **at the same time**, and anyone can watch any battle. If two attacks hit the same tile, or one starts from a tile under attack, the second waits for the next wave.
- **Auto-battle:** a button lets the computer fight for you. A side that gives no order for 15 seconds is put on auto. Bots and players who have left always fight on auto, and the host's Skip hands a player's battles to the computer.

**Decided while building (please check)**
- **Loot is taken automatically** (largest piles first) instead of using the picker, so battles don't stall the round.
- **Damaged doesn't apply in Total War.** Losing land and loot is penalty enough.
- **Moving and attacking:** in Total War you pick exactly which unit types to move or send. Other War modes still move "any N units", which are always militia.
- Battle randomness only shapes the terrain. The fighting itself has no dice: positioning, numbers, unit types and terrain decide.

### Battles, version 2 (11 November 2026)
After the first playtest ("a bit laggy, fast and weird; War of Dots shows a frontline"):
- **Each unit is 3 dots** on the battlefield (`totalwar.dotsPerUnit`). The unit's toughness and damage are shared between its dots, and they move in a small formation. Tapping one dot selects the whole unit. After the battle, surviving dots are grouped back into whole units, rounding up.
- **Territory and frontline.** Ground within 3 squares of a dot becomes that side's (the nearest dot wins) and **stays** theirs until enemy dots take it. The attacker starts with a strip on the left, the defender with most of the right. The battle screen tints each side's ground and draws a dark **frontline** where they meet.
- **Supply through your own territory.** A dot is supplied if it can trace a path to its side's map edge without crossing **enemy territory** (empty ground is fine). Cutting a corridor through the enemy's ground behind them encircles them; cut-off ground shows as a red pocket. Marching forward lays your own corridor, so a normal advance stays supplied.
- **Slower:** movement speeds and damage roughly halved, battles last up to 120 seconds, and capturing the flag takes 10 seconds. Unit damage and speed may now have one decimal place in the lobby.
- **Slow motion (battle speed 60%):** battles now play at 60% of that pace. Everything slows down together: movement, damage, the clock, capturing and surrendering. A full battle therefore lasts up to about 200 real seconds, and taking the flag takes about 17. The battle screen shows real seconds. (`battleSpeedPct`; 100 = the old pace.)
- **Smoother:** the browser slides dots between the server's 5-a-second updates and redraws only what changed.


## 🏭 Factories in the Base game (added 11 November 2026, from the in-person playtest)

What the group asked for: the Flood starts at 5; you expand only by building factories; claiming someone's factory is a dice "battle"; sustainable and unsustainable factories, unsustainable cheaper but at most 3; if everyone builds sustainable factories the Flood can go down.

Decided with the group:
- **Green factories:** at Reveal & collect, the Flood drops 1 for every 3 sustainable factories on the board (everyone's counted together).
- **Dirty factories:** each unsustainable factory adds +1 Flood every round while it stands.
- **Claiming:** both roll one die, higher wins, ties go to the owner. The winner takes the factory.
- **Round actions stay:** Sustainable / Unsustainable still happen as before; factories produce on top. "Claim a factory" replaces Raid while factories are on.

Decided while building (all numbers are lobby settings):
- **Starting Flood 5 is for Base only** (setting: base.startingFlood). War, Empire and Total War keep their own starting Flood (2), because their catastrophe lines are much higher.
- **Costs and output:** sustainable = 1 wood + 2 stone + 1 sandbag, makes 1 a round; unsustainable = 1 wood + 1 stone, makes 2 a round. A factory makes its tile's resource; one on a Mixed home tile makes whatever the owner has least of.
- **Where you can build:** your home tile, or an empty land tile next to your home or to one of your factories. One factory per tile; never on another player's home tile or the village.
- **Claims:** cost the claimer 1 wood (like a raid). Factories on a home tile can't be claimed, so nobody loses their home. You can't claim an unsustainable factory if you already own 3. Claims resolve in clockwise order after collecting; if two players claim the same factory, the second one fights whoever owns it by then. A claim counts as hostile: it breaks a pact and a "no attacks" treaty forbids it.
- **Demolish:** you may demolish your own factory during a build phase (no refund), so a group can replace dirty factories with clean ones.
- **Timing:** factory output and the factory Flood change happen at Reveal & collect, together with the round's Unsustainable actions, then the catastrophe check. The Flood never goes below 0.
- **Scoring is unchanged:** factories aren't worth points themselves; what they make is.
- **Older tests** still check the rulebook game (factories off, Flood 2); the factory rules have their own tests in test/factories.test.js.

## Total War: picking a unit (fixed 11 November 2026)
The battlefield redraws its dots every animation frame, so a tap on a unit often lost its target and nothing was selected. Taps are now matched to the nearest of your units on screen. Tapping a unit selects just that unit; **Add to selection** (or Shift/Ctrl) builds a group. The recruit picker also remembers the unit type you last chose.


## ⚔ Total War: research, aircraft, navies and formations (added 11 November 2026)

What the group asked for:
- A research system like Call of War. Artillery → light → medium → heavy tanks; infantry → motorised → mechanised; then aircraft (interceptors and bombers); militia upgrade to anti-tank or anti-air.
- A bigger map with naval battles fought the same way as land battles.
- Air battles.
- Formations, preset by what you have, that change mid-battle by themselves or by hand.

Decided with the group:
- **Research:** pay materials during a build phase. It's done at the start of the next round. One project at a time.
- **Map:** a bigger board with sea bays between the players.
- **Air:** a separate live air battle first. The winner gets air superiority, and its bombers join the land battle.
- **Formations:** presets you pick during a battle, depending on your units, with small bonuses. You can change them at any time; Auto-battle changes them by itself.

Decided while building (all numbers are lobby settings in the Total War group):
- **Research tree:**
  - Artillery → Light tanks → Medium tanks → Heavy tanks.
  - Motorised → Mechanised → Aircraft (both plane types).
  - Anti-tank guns; Anti-air guns.
  - Shipyards → Cruisers → Battleships.
  - Costs: 4 to 10 materials, any mix, paid from your biggest piles.
- **Upgrades** pay the cost difference (at least 1 per unit), along these lines:
  - militia → anti-tank or anti-air;
  - infantry → motorised → mechanised (you can skip a step);
  - cavalry → light → medium → heavy tank;
  - destroyer → cruiser → battleship.
- **Matchups:** each unit has a damage-vs-armour % and a damage-vs-aircraft %.
  - Tanks and mechanised infantry are armour.
  - Only anti-air and aircraft can hurt planes.
  - Ships only fight ships, apart from shore bombardment.
  - **Specialists:** anti-tank guns do 600% against tanks and mechanised infantry, and anti-air guns do 500% against aircraft. Both do only 15% against troops, and anti-air does 10% against tanks. Up close they always go for the target they are best against first. (`vsSoftPct` is a new per-unit lobby setting, "damage vs troops (%)".)
  - The old cavalry rules still apply to militia and to infantry, and now also to anti-tank, anti-air and motorised units.
- **Ranged units:** artillery (14), anti-air (7, aircraft only), cruisers (6) and battleships (10) fire at range when nothing is in contact. Artillery fights at 40% up close. The Artillery screen formation adds +3 to artillery range.
- **Board:** Total War now uses `sea37` (37 hexes) by default. Each wedge is:
  - capital Ck;
  - province Mk on the second ring;
  - coastal province Ek.

  Sea bay Sk sits between neighbouring wedges and touches both. The bays are joined by the open ocean, so ships can sail between any two of them. The 19-hex board can still be chosen in the lobby.
- **Ships:**
  - Ships are launched into a bay next to land you hold, and no enemy fleet may be in that bay.
  - A bay belongs to whoever has ships in it; an empty bay belongs to nobody.
  - Sea bays produce nothing and don't score.
  - The loser of a naval battle withdraws to another bay it holds, or an empty one. If there's nowhere to go, the ships are scuttled.
- **Amphibious attacks** (on by default): you can attack a land tile next to a bay your ships hold, from any of your coastal tiles that has troops. Ships themselves never go ashore.
- **Shore bombardment:** cruisers and battleships in bays next to a land battle add 35% of their attack per second. They hit the enemy troops nearest the flag.
- **Air battles** happen only when both sides send or hold aircraft at the fought-over tile.
  - Interceptors do 150% against bombers. Bombers are weak in a dogfight (20% of their attack).
  - Air battles have no flag. They last at most 45 s; then the side with more health left wins, and ties go to the defender.
  - The winner's surviving bombers join the land battle.
  - Interceptors, and the loser's planes, sit the land battle out.
  - If only one side has planes, it has air superiority automatically.
- **Planes never hold ground:** after the land battle, every plane flies back (attackers to the tile they came from). A bomber-only attack can wipe out the defenders, but it doesn't take the tile.
- **Formations:**
  - A formation arranges your units around their centre, facing the enemy.
  - It gives an attack, protection or speed bonus until you change it (2 s between changes).
  - Air battles have none; naval battles only have Line and Defensive square.
  - Auto-battle uses Defensive square when outnumbered or cut off. Otherwise attackers favour Pincer when much stronger, then Armour spearhead or Combined arms, and defenders favour Artillery screen or Combined arms.
- **Bot difficulty** (lobby, next to Add bot): Normal, Hard (+3 materials a round for each bot) or Brutal (+6). The bonus is paid at the start of every round and spread across each bot's smallest piles. Both amounts are lobby settings.
- **Bots** research an army-focused plan that suits their personality (warlike: tanks and aircraft first; cautious: motorised and anti-tank first). Only the warlike bot researches ships, and only at the end. After the first tech they research only while they have a few units in the field. Once they have 3 units they save up for good units (tanks, aircraft, mechanised infantry) instead of filling up on militia, and they upgrade old units. While the Flood is far from the line they choose Unsustainable much more often, for the income. They recruit bigger armies than in War, build walls only when the Flood is a real threat, and sometimes launch ships.
- **Older tests** still use the 19-hex board (test/totalwar.test.js); the new rules are tested in test/arsenal.test.js.

## Artillery: visible fire, helpless up close (11 November 2026)
- Guns now show their fire on the battlefield. Artillery, ships and anti-air shells fly from the gun to the target and burst on impact, about one visible shell per gun dot each second (damage is still dealt continuously). Shore bombardment comes in from the map edge, and anti-air shows as yellow tracers.
- Aircraft now look like aircraft. Bombers and interceptors are drawn as plane silhouettes raised above the battlefield, with a shadow on the ground, pointing the way they're flying. Bombers attacking ground troops drop visible bombs (about one per bomber dot each second): each bomb falls from the plane, then a big orange blast with a smoke ring goes off.
- **Stronger bombers:** attack 6 (was 4). They do 160% against tanks and mechanised infantry (was 120%) and 130% against troops (was 100%), so against ground targets they deal roughly double what they used to. Each bomb also splashes: other enemy ground units within about 1.5 squares of the target take 50% (`bomberSplashPct`), so packed formations suffer. Anti-air (500% against aircraft) is the counter.
- Artillery caught in close combat does only 15% of its damage (was 40%) and takes 150% damage. Both numbers are lobby settings (`artilleryMeleeAttackPct`, `artilleryMeleeDamageTakenPct`). Keep your guns behind the line.
- **Artillery range 14 (was 9), and the guns follow the army.** About once a second, artillery you haven't moved yourself moves to just inside its range of the nearest enemy, so it keeps firing as the front advances. Once you move a gun by hand it stays where you put it; picking a formation sends it back to following. Its speed is unchanged, and it's still weak in close combat.
- **Moving in formation:** when you order several units at once, the whole group shifts together and keeps its shape, with the group's centre landing where you tap. A single unit still goes straight to the spot. The **⬢ Whole army** button selects everything.
- **One battle at a time:** a player fights one battle at a time. When two attacks hit the same player, the second waits and starts as soon as the first ends. Battles between other players still run at the same time. The battle screen shows what's next for you.
- **Auto-fill:** the recruit payment fills itself in from your biggest piles whenever you change the unit or the number. You can still adjust it by hand, or use ⚡ Auto-fill and Clear. The village seawall has the same buttons.

## ⚔ Total War: unit levels, self-propelled guns, the ocean map (added 12 November 2026)
- **Unit levels 1–4.** Infantry, motorised and mechanised infantry, artillery, self-propelled artillery, light/medium/heavy tanks, interceptors, bombers, destroyers, cruisers and battleships each have levels. Each level is its own research project ("Light tank level 2"), needs the unit itself (or the level before), and makes **every** unit of that type stronger at once — no rebuying. Each level above 1 adds +15% toughness, +15% damage and +5% speed (`levelHpPct`, `levelAttackPct`, `levelSpeedPct`); levels 2/3/4 cost 4/6/9 materials (`levelCost`). Ships' shore bombardment grows with their level too. Militia, cavalry, anti-tank and anti-air have no levels (they are the cheap/specialist units). Levels are public: the battle screen shows them (◆3ᴸ³).
- **Self-propelled artillery ✜.** Research *Self-propelled guns* (needs Artillery and Motorised infantry, 7 materials). Same range as artillery (14), a bit more damage, toughness 16 and speed 4 (towed artillery: 1.8), so it keeps up with the tanks. It counts as armour (anti-tank guns hurt it) and is still poor in close combat. Old artillery can be upgraded to it (pay the difference).
- **The oceans board** is now the default Total War board (the 37-hex sea board is still a lobby option). 84 hexes: two continents with an ocean between them and the Village on an island in the middle. With 4 players, two share each continent; with 3, two in the west and one in the east; with 5, three in the west. Tiles are named by map grid (A1–K8).
- **Sea lanes:** on the oceans board ships move hex by hex through sea that is theirs or empty (no more jumping between bays), and attack only the sea hexes next to their fleet.
- **Convoys:** troops can only attack across the sea along an unbroken chain of your ships — from a coast of yours that the chain touches to a coast it touches. Break the chain (sink a ship in it) and the landing is off.
- **Fishing grounds 🐟:** five sea hexes earn whoever holds them +1 material a round (the one you have least of; `fishingIncome`).
- **Blockades ⚓:** a coastal tile with enemy ships next to it, and none of its owner's, earns nothing that round (`blockades`; not during the opening truce).
- **Map zoom:** scroll / pinch to zoom, drag to move around, ＋ / － / ⟲ buttons; big boards open zoomed in on your capital.
- **Bots** research levels for the units they field most, upgrade artillery to self-propelled guns, and on the oceans board research shipyards early when an enemy is overseas, keep a growing fleet, grab fishing grounds and stretch a chain of ships toward enemy coasts to invade. In a 3-game test they built ~13 ships a game, held most fishing grounds and made a few landings.

## ⚔ Total War: navies that matter (added 12 November 2026)
- **Crossing the ocean:** put a ship on every sea hex between your coast and the enemy's (launch ships from 🏗️ Build → Recruit onto a sea hex next to your coast, then move them out hex by hex). In the Choose phase the enemy coast at the end of the chain shows up as an attack target; pick one of your coastal tiles as "Attack from" (marked 🚢 lands by sea).
- **Bombardment 💥:** in Talk & Build, cruisers (1 shot) and battleships (2 shots) can shell an enemy tile right next to their sea hex — tap the ship's hex or the enemy coast → *Bombard*. Each shot has a 50% chance (`navalHitPct`, raised by the ships' level) to destroy one unit there. Once per round per sea hex; not during the opening truce; counts as hostile (breaks pacts, forbidden by treaties that forbid attacking that player).
- **Convoy interception 🚢:** when troops cross the sea, every enemy cruiser and battleship next to the chain of ships carrying them fires (same shots and chance). Each hit sinks one crossing unit before it lands. Each of the attacker's **destroyers** in the chain screens off one shot, so destroyers are the convoy escorts.
- **Bots** shell enemy coasts with their gun ships (except cautious bots).
- **Updates:** pages now reload by themselves when the server is updated (so you never play with old code after a deploy), and browsers always check for new files.
- **Research screen:** each technology has a ▸ levels dropdown for the units it unlocks (Infantry has its own row at the top).

## 🎲 Random maps (added 13 November 2026)
- New Total War board option **random** (lobby → Board): every game makes a new map from the game's seed (the same seed always gives the same map).
- 13–15 columns × 8–9 rows (about 100–135 hexes). 2–4 continents are grown from random starting points and kept apart by sea; any lake cut off from the ocean is filled in, so the sea is always one connected ocean (sea lanes, convoys, bombardment and blockades all work as on the oceans board).
- The Village goes on an island in open water near the middle when there is room (otherwise on the nearest sea hex that doesn't cut the ocean in two). 4–6 fishing grounds are spread over the ocean.
- Starting spots: capitals are spread as far apart as possible, each with two neighbouring provinces, and every player gets at least one coastal tile (to launch ships). A map is only used if nobody has much less nearby land than the others (the smallest share must be at least 55% of the largest); otherwise a new one is drawn. In 900 test maps for 3–5 players every attempt produced a valid map (worst case under a second); if one ever failed, the game would use the oceans map.

## ❓ Tutorials (added 13 November 2026)
- Every mode (Base, War, War + Empire, Total War) has a short guided tour of the game screen: a spotlight on each part of the screen with a card that explains it (11–13 steps, about a minute). The rule numbers in it come from the game's own settings, so they match whatever the host set in the lobby.
- It starts by itself **the first time** you play a mode on a device (remembered in the browser). **Skip tutorial** or finishing it means it never pops up by itself again for that mode. Leaving the game in the middle of the tour doesn't count, so it comes back next time.
- The **❓** button in the top bar restarts the tour from the beginning at any time. Keys: → next, ← back, Esc skips.
- Also fixed: on phones, the host's **Host ▾** button was hidden in the top bar.

## Reinforcing across the sea (fixed 13 November 2026)
- You could invade across the sea but couldn't move more troops to the land you took. Now **Move** (Talk & Build) also sends land units across the sea along your ships: the same unbroken chain an invasion uses (on the 37-hex board, any bays you hold, since they are joined by the ocean). Moves over your own land are tried first.
- Troops shipped this way can be shot at like a convoy: enemy cruisers and battleships next to the chain fire, and each of your destroyers in the chain blocks one shot.

## 🚢 Transport ships and capitals that take everything (added 13 November 2026)
- **Transport ships replace the chain of ships** (oceans and random boards). Your ships on sea hexes **next to one of your coastal tiles** carry the troops on that tile across the sea in one go: **3 troops per ship** (`transportPerShip`), to any enemy coast up to **6 sea hexes** away counting the hex the ships are on (`transportRange`), through sea that is empty or yours — enemy ships block the way. It works for attacks (Choose secretly → Attack, "Attack from" your coast, marked 🚢 by sea) and for moving reinforcements in Talk & Build. Asking for more troops than the ships carry is refused; if ships are lost before the attack resolves, the extra troops stay home.
- **Interception** now follows the ships' route: enemy cruisers and battleships next to the shortest sea route fire on the crossing troops; each destroyer among the transports (or on the route, if yours) blocks one shot.
- **When a capital falls, the rest of the territory falls with it.**
  - *War + Empire* (`empire.capitalTakesAll`, on by default): the puppet keeps only its capital; its provinces and any other land it held go to the new overlord (empty), the puppet's troops there lay down their arms, and anyone else's go home. If the puppet is freed (revolt, release or an unpaid garrison) its own provinces come back to it.
  - *Total War* (`totalwar.capitalTakesAll`, on by default): when a player's own capital is taken, all their other land surrenders to the conqueror and their troops there lay down their arms. Their ships stay at sea.
- Bots: send only what their ships carry, keep ships at their coast as transports (only spare ships go fishing), and stop trying to recruit once they have no land.

## 🤖 Tougher Total War bots (13 November 2026)
A playtester massed cheap militia (low upkeep), saved up and out-built everyone late; the bots couldn't keep up even on Brutal. Measured in bots-only games (4 bots, Brutal): before, ~10 units and an army worth ~74 materials per bot at the end, with a third of it in cruisers they didn't need. Changes:
- **Bigger armies:** the army size bots aim for grows every round and with difficulty (Normal ×1, Hard ×1.5, Brutal ×2).
- **Mass early, upgrade later:** in rounds 1–6 bots fill their ranks with cheap upgradeable troops (infantry, cavalry), then upgrade them in bulk (several at a time) to motorised/mechanised infantry and tanks.
- **No hoarding on Hard/Brutal** while the army is under 70% of its target; leftover materials buy troops.
- **Counters:** bots look at what the other players field and build anti-tank (or heavier tanks) against armour and anti-air (or interceptors) against aircraft.
- **Smarter attacks:** they compare real strength (cost × research level) instead of head counts; Hard/Brutal bots attack with smaller margins.
- **Smaller, cheaper navy:** destroyers as transports; cruisers and battleships only when an enemy has warships; a bigger fleet only when an enemy is overseas.
- **Bigger bonuses:** Hard +5 and Brutal +10 materials a round (were +3 / +6).
- Result (Brutal): ~10 units/bot by round 6 and ~14 by the end, army value ~89 (Hard ~82; Normal is unchanged and gentle, ~5 units).
- **Update (same day): bots that keep pace with big human armies.** Playtesters still ended with 18–25 units each against the bots' ~14. Now:
  - **Cheaper upkeep for bots:** Hard bots pay 75% and Brutal bots 50% of normal upkeep (`botUpkeepPctHard`, `botUpkeepPctBrutal`).
  - **Catch-up:** every round, a Hard/Brutal bot whose army is worth less (in materials) than the strongest human army gets 15% / 30% of the gap as extra materials, at most 15 a round (`botCatchUpPctHard`, `botCatchUpPctBrutal`, `botCatchUpMax`). The log says who is catching up.
  - Army goals are bigger: Hard ×1.6, Brutal ×2.5.
  - Measured (bots-only games plus one seat counted as human): Brutal bots ~24 units and an army worth ~140 materials each by the end; Hard ~20 units, ~112.

## 🎖 Veterans (added 13 November 2026)
Battle experience now matters, as it did in real wars.
- **Every unit that survives a battle goes up one rank** — whether its side won or lost (holding out teaches too): green → **Seasoned ★** → **Veteran ★★** → **Elite ★★★** (the top).
- **Bonuses:** +10% damage and toughness per rank (`rankBonusPct`); veterans and elites move 5% faster (`rankSpeedPct`); elites hold out twice as long when cut off before surrendering (`eliteHoldPct`).
- They stack with research levels (levels = better equipment, ranks = better soldiers).
- **Kept on upgrade:** upgrading veterans (e.g. infantry → motorised) keeps their rank — same soldiers, new kit.
- **Where ranks go:** each tile remembers how many of each unit type are veterans. When troops leave a tile (moves, attacks), the best go first. Units lost outside battle (upkeep, shelling, convoy losses, surrender of a territory) are recruits first; veterans who die in battle are gone, with their experience.
- **Seen on screen:** gold outlines and ★ above veteran units in battle; ⚔3★ on map badges when a stack has veterans; the tile menu lists them (🎖 2★★ 1★); the log says when survivors gain experience.
- **Bots** count veterans when judging whether an attack can win.

## 🌊 Base game, second playtest round (added 14 November 2026)
From the playtest comments:
1. **Both factories make the same: 2 a round** (`factorySusMakes` 1 → 2). The difference is now only cost and their effect on the Flood.
2. **Bigger board, fair resources:** the Base game uses a new **37-tile board** (`base.boardLayout: 'base37'`; the 19-tile board is still in the lobby). Open tiles are dealt from an even deck (equal forest, quarry and riverbank, ±1 — no more "too many sandbags"), shuffled every game, and the shuffle is redone until every home has all three resources within 2 tiles and no home has more than 1 extra of any resource compared with another (fairest of up to 300 shuffles).
3. **The Flood starts at 3** (was 5): too many things pushed it up.
4. **The Flood follows the majority** (`floodByMajority`): after the reveal, if **more than half** of the players chose Sustainable the Flood falls 1; if more than half chose Unsustainable it rises 1; otherwise (a tie or no clear majority, counting claims/raids as neither) it doesn't move. Individual Unsustainable actions no longer add +1 each.
5. **Factories in groups of 3:** every 3 unsustainable factories on the board (everyone's together) raise the Flood 1 each round (`factoryUnsPer: 3`; was every single one), and every 3 sustainable ones lower it 1 (unchanged).
- Everything is a lobby setting. The older tests still check the rulebook game and the first playtest (v1.1) settings; the new rules have their own tests.
- **The printed Base Rulebook v1.1 is now out of date** on these five points.
- **Guided first round (Base game):** the screen tour wasn't easy enough for new players, so the first time someone plays Base they now get a hands-on tutorial that plays round 1 with them, like other games: "Tap your home" → "Open Build" → "Press End turn" → "Pick Sustainable" → "Lock it in" → what happened at the reveal → "Build again" → "Finish the round". Each "do this" step highlights the thing to tap (pulsing gold), waits until you've done it and then moves on by itself; the game stays clickable while it runs. The ❓ button now offers both: **Play the first round with me** or **Tour of the screen**. Other modes still start with the screen tour.

## ⚡ Smoother Total War battles (14 November 2026)
Battles felt laggy with big armies. Measured and fixed (no rule changes):
- **Server:** supply lines and territory were worked out by checking every square against every unit; now each unit paints the squares near it. Contact and spacing checks only look at nearby units (a grid) instead of every pair. A big battle (~380 dots) now takes ~3.3 ms per update instead of ~7.8 ms (on the free hosting plan, which has a small slice of a CPU, that difference is much larger).
- **Less data:** updates are only sent for battles still being fought, and the territory map and formation list only when they change (plus every 2 seconds for anyone who just joined).
- **Browser:** the battlefield is redrawn at 30 frames a second instead of 60, the battle data is rebuilt once per update (5 a second) instead of every frame, the territory layer only when it changes, and the veteran-star check no longer compares every unit with every other.

## 🛡 Counters to tanks (added 15 November 2026)
Tanks had only one counter (anti-tank guns, useless against everything else). Three realistic additions:
- **Bazookas** (research, 8 materials, after **Infantry level 4**): infantry, motorised and mechanised infantry do at least **100%** of their damage to tanks (`bazookaVsArmorPct`; normally 40% / 50% / 80%).
- **Terrain:** tanks, tank destroyers and self-propelled guns bog down — **40% speed in forests, 50% on hills** (`tankForestSpeedPct`, `tankHillSpeedPct`; trucks and other wheeled units are slowed less). **Ambush:** militia, anti-tank, infantry, motorised and mechanised infantry standing in a forest or on a hill do **150%** damage to tanks (`ambushVsArmorPct`). Tanks rule open ground; rough ground favours infantry.
- **Tank destroyer ◈** (research Tank destroyers, 7 materials, after Anti-tank guns + Medium tanks; or upgrade an anti-tank gun): armoured and fairly fast (speed 4.5, toughness 24), **300% vs tanks**, 50% vs troops. Has levels 1–4 like other units. Bots build them (and anti-tank) against armour and research Bazookas late.

## 🎯 Tanks fire at range, and ⚑ Generals (added 15 November 2026)
**Range:** tanks and anti-tank guns now shoot at a distance like real tank gunners: light tanks 3 squares, mediums 4, heavies 6, tank destroyers 6, anti-tank guns 5 (they can sit behind your infantry). At range they aim at what they're best against (armour first); tanks do **50%** to troops at range (high-explosive shells, `tankRangedSoftPct`) and full damage up close; tanks, tank destroyers and anti-tank guns firing **on the move** do **50%** (`movingFirePct`). Once units are in contact (about 2 squares), close-quarters fighting is exactly as before.

**Generals:**
- Everyone starts with **one general** on their capital. Appoint more on any tile you hold (**10** materials, `generalCost`), up to **3** (`generalMax`), or **promote an Elite ★★★ unit** for free (the unit leaves the ranks; the general starts with one win's experience). Each general gets a name and a random **trait**.
- Move a general to any of your tiles (over your land, or by sea on your ships): tap their tile → ⚑ Move, then tap where to send them.
- **In battle:** attacks launched from a general's tile, and battles fought on it, bring the general along. The general rides with that side's toughest unit (gold ⚑ above it, aura ring around it). Units within **6 squares** get **+15% damage and toughness**; each win adds +1 square and +5% (up to 3 wins).
- **Traits:** Tank commander (armour in the aura +20% damage), Defender (units in the aura take 20% less when defending), Swift (the whole army +10% speed), Artillerist (guns in the aura reach 3 squares further).
- **Death:** if the general's unit is destroyed, the general is killed and that side is shaken (−10% damage for 8 seconds). A general on a tile that falls without a fight, or that surrenders when its capital falls, is captured. After a battle the general goes with their survivors (the captured tile, home, or the nearest tile of theirs).
- Bots appoint a second and third general as their armies grow and keep them with their biggest stacks.

## 🌾 Battlefield terrain (added 15 November 2026)
Before, a battle's ground came from the tile's **biome**, so every battle was woods, hills or a river, all clustered round the objective. Tanks never had open country to fight in.
- Every land tile in a War game now has a **terrain type**, separate from its biome. The biome still decides what the tile produces; the terrain decides the battlefield.
  - 🌾 **Plains**: open ground, at most one small copse or rise. Tank country (about 98% open).
  - 🌳 **Woods**: woods round the objective (tanks bog down, infantry ambush).
  - 🏔 **Hills**: hills round the objective (slow for tanks, strong for defenders).
  - 〰 **River**: a river across the field with two fords.
- Mix: **40% Plains**, 30% the biome's own terrain (forest → Woods, quarry → Hills, riverbank → River), 15% each of the other two. Mixed tiles: 40% Plains, 20% each.
- Terrain uses its own random stream from the game seed, so it never changes any other dice.
- Shown on the Total War map (small marker on each tile, plus the legend) and in the tile menu.
- Bots rate a tank-heavy army higher when attacking Plains and lower in Woods or Hills, and prefer open country for their tanks.
- Old saved games without terrain fall back to the biome's terrain.

## 🗺 Continent board (added 15 November 2026)
- New Total War board, **continent** (lobby → Board). One huge landmass, west against east: 86 land hexes, a long land front with the Village in the middle, and a sea along the north coast (with three fishing grounds) so ships still have a job.
- Capitals sit on the far west and east edges, each with two neighbouring provinces. 3 players: two west, one east. 4 players: two each side. 5 players: three west, two east.
- Tiles are named by map grid (A1–M8). Battlefield terrain works as on every War board, so the front is a mix of plains, woods, hills and rivers.

## ⚔ Historical scenarios: Eastern Front, 1941 (added 15 November 2026)
Total War lobby → **Scenario: Eastern Front, 1941**, and **Style: Balanced / Historical**. The scenario replaces the board and the normal setup.
- **Two sides, 2–5 players.** Seats 1, 3, 5 play 🟫 Germany; seats 2 and 4 play 🟥 USSR (move players ▲ ▼ in the lobby to change sides; empty seats can be bots). A side with several players splits its country: Germany (Berlin), Germany (North, Königsberg), Germany (South) & Romania (Bucharest); USSR (Moscow), USSR (North, Leningrad), USSR (South, Kiev). Each player's HQ is their capital. Teammates can't attack each other and share the win. No pacts or treaties.
- **Map:** a stylised Germany–Poland–western USSR: 112 land hexes, the Baltic Sea in the north, the Black Sea in the south, 19 named cities. Terrain is set by the map (Belarus woods, the Pripyat marshes, Ukrainian plains, the Dnieper at Kiev, the Volga at Stalingrad).
- **Economy:** 1 material for every 2 tiles you hold, +1 for each city, +3 for each ⚙ industrial city (Berlin, Silesia, Ploiești; Leningrad, Moscow, Kharkov, Stalingrad, the Urals). No Sustainable/Unsustainable bonus and no plunder. Each style scales a side's income.
- **Turns:** choose **Hold** or **Attack**. Attacking costs no income, and a side may launch **4 attacks a round** in total (setting `scenarioAttacks`), shared between its players (the side's first player gets the remainder) — so a 2-player side doesn't get twice the attacks of a 1-player side. Each attack needs its own target; troops from one tile can be split between attacks. Each player still fights one battle at a time.
- **Victory:** taking the enemy capital (Moscow for Germany, Berlin for the USSR) wins at once. Otherwise, at the end of round 18, Germany wins with 2 of the 3 ★ victory cities (Leningrad, Moscow, Stalingrad); the USSR wins with all 3; else the side with more points wins.
- **Winter** (Historical rounds 6–9, Balanced 7–8): tanks move at 50% / 70% speed in battle and attackers do 80% / 90% damage.
- **Reinforcements** arrive on set rounds at the named city (or an HQ if it has fallen): German panzers (round 4), the Siberian divisions at Moscow (6), the T-34 (research, 7), tank armies from the Urals (9), German heavy tanks (10), reserves on the Volga (12).
- **The Flood is off**, the opening truce is off, and the board is fixed.
- **Styles:**
  - *Historical:* Germany starts with a big, modern army (levelled tanks and infantry, motorised troops, bombers) and 150% income; the USSR starts with a large but mostly militia/infantry army, weak tech, and 70% income (its industry is disrupted) that recovers to 110% from round 7. Strong reinforcements and a hard winter.
  - *Balanced:* the same armies; Germany 165% income, the USSR 80% then 100% from round 7; a milder, shorter winter and smaller reinforcements.
- **Bots** play either side: several attacks a round aimed at victory, industrial and other cities; they keep a garrison in their capital (8 units when the enemy is within 2 hexes, else 4) and leave a unit behind on front-line tiles they attack from.
- **Bot-vs-bot results** (8 games each): Balanced — 1v1 4–4, 2v1 3–5 (Germany–USSR), 2v2 6–2, 3v2 2–6; Historical — 1v1 5–3, 2v1 6–2, 2v2 7–1. Historical favours Germany, as planned; Balanced is roughly even.

## ⚔ Historical scenario: France, 1940 (added 15 November 2026)
Total War lobby → **Scenario: France, 1940** (Balanced or Historical). Same scenario rules as the Eastern Front (two sides, Hold or Attack, 4 attacks per side per round, cities and ⚙ industry, capital-capture victory, no Flood, no pacts), with:
- **Sides:** 🟫 Germany (seats 1, 3, 5) vs 🟦 the Allies (seats 2, 4). Splits — Germany: 1 player all; 2 players Germany (Berlin, north + Army Group A) and Army Group C (Munich); 3 players Germany (Berlin), Army Group A (Cologne), Army Group C (Munich). Allies: 1 player all; 2 players France (Paris) and Britain & the Low Countries (London); 3 players France, Britain (London, plus the BEF at Calais and Lille), Belgium & the Netherlands (Brussels).
- **Map:** 13 × 9 hexes. Britain is an island across the Channel (troops need transport ships); the North Sea; the Netherlands and Belgium; France; western Germany. 18 named cities. ⚙ industry: London, Lille, Paris, Lyon; Berlin, Cologne (the Ruhr).
- **The Maginot Line** (Metz, Strasbourg and two more hexes on the Franco-German border) is **fortified**: defenders there take only **50%** of the damage. The Ardennes (woods and hills through Belgium and Luxembourg to Sedan) is the way round — lightly held at the start.
- **Victory:** taking **Paris** wins for Germany; taking **Cologne** (the Ruhr) wins for the Allies. Otherwise, after round 12, Germany wins with 2 of the 3 ★ victory cities (Paris, Brussels, Calais); the Allies with all 3; else points.
- **No winter.** Reinforcements: French reserves at Paris (round 3), German panzers at Cologne (4), British divisions at Calais (5), the last French reserves (7).
- **Historical:** Germany 140% income, a strong panzer group in front of the Ardennes, levelled tanks and infantry; Allies 90% income, many units but spread thin, a weak Sedan. **Balanced:** Germany 120%, Allies 105% with level-2 infantry and stronger reserves.
- **Bot-vs-bot results:** Balanced — 1v1 3–5 (Germany–Allies), 2v1 3–5, 2v2 4–4, 3v2 11–5 (16 games); Historical — 1v1 6–2, 2v2 7–1.
- Scenario engine changes: sides have their own icon and their own region splits; the region marked `main` holds the side's capital; split-side players are named after their region (e.g. France, Britain).

## 🛡 Bunkers (added 15 November 2026, every Total War game)
- New research **Fortifications** (5 materials, no prerequisites). It lets you build **bunkers** on land you hold, during Talk & Build: tap the tile → 🛡 *Build a bunker*.
- Levels: **1 → 2 → 3**, costing **5 / 8 / 12** materials (any mix). Each level cuts the damage the tile's **defenders** take by **15%** (level 3: they take 55%). Settings: `bunkerCost1-3`, `bunkerPct`.
- Bunkers only help whoever **defends** that tile. When the tile is captured the bunker loses **1 level** (`bunkerLostOnCapture`) and the new holder keeps the rest.
- Bunkers stack with a scenario's fortified line (the Maginot Line: 50% × the bunker's %).
- Shown on the map as 🛡1 / 🛡2 / 🛡3 and in the tile menu.
- Bots research Fortifications (cautious early, balanced mid-plan, warlike late) and build up to 1 bunker a round (2 in scenarios) when they have money to spare: capital first, then victory and industrial cities, then the exposed tile with the most units.

## ⚔ Historical scenario: North Africa, 1941 (added 15 November 2026)
- 🟫 **Axis** (Italy & the Afrika Korps) vs 🟦 **Allies** (Britain & the Commonwealth). 14 rounds. Splits — Axis: Italy (Tripoli), Afrika Korps (Benghazi), the desert (Jalo); Allies: Britain in Egypt (Cairo), the Western Desert Force (Tobruk), the desert (Siwa). With 2 players on a side: the capital region, and everything else.
- **Map:** a 16-hex-long coast from Tripoli to Suez, the Gulf of Sirte, open desert (almost all 🌾 plains — tank country). The **Qattara Depression** (no hexes) narrows the front at El Alamein. 16 named cities. ⚙ industry: Tripoli, Alexandria, Cairo, Suez.
- **Starting bunkers:** the fortress of **Tobruk** (level 2) and the line at **El Alamein** (level 1).
- **Victory:** the Axis wins by taking **Cairo**, the Allies by taking **Tripoli**. Otherwise after round 14 the Axis needs 2 of the 3 ★ victory cities (Benghazi, Tobruk, Alexandria), the Allies all 3; else points.
- **Reinforcements** (Historical): Commonwealth divisions at Alexandria (round 3), a panzer division at Tripoli (4), British tanks at Cairo (6), Axis convoys at Tripoli (8), American tanks and heavy-tank research for the Allies (9), Eighth Army reserves (11). Historical: Allied income rises from 100% to 120% in round 9 (American supplies); the Axis has 110%. Balanced: Axis 115%, Allies 100%, smaller reinforcements.
- **Bot-vs-bot (balanced 1v1, 20 games):** 9–11. Historical 1v1 favours the Allies, 4–16 — as the campaign ended.

## Scenario fixes and re-balancing (15 November 2026)
- **A regional HQ falling no longer surrenders its whole region** (only the side's main capital counts — and taking that wins the war). Before, the Allies could take Benghazi in round 2 and get the whole Afrika Korps with it.
- France 1940 Balanced re-tuned now that bots build bunkers: Germany 115% income, the Allies 130% (20 bot games 1v1: 10–10; 2v2: 6–6; Historical 1v1: 7–5 to Germany).
- Bot-vs-bot results vary a lot between runs (the bots make random choices); treat any single 8–10 game result as ± 2–3 games.

## 📜 Historical-accuracy pass (15 November 2026)
16 bot-vs-bot **Historical** games per scenario were played and every key city's fall was tracked against the real campaigns. They drifted from history (Germany took Moscow in 11/16 games, the Maginot Line fell in round 2, the Axis collapsed at once in North Africa), so:
- **Initiative** (new scenario rule): a style can set how many attacks each side gets per period of the war, instead of the lobby's attacks-per-side setting. Historical uses it:
  - *Eastern Front:* Germany 6 / USSR 2 (rounds 1–5, Barbarossa) → Germany 3 / USSR 4 (rounds 6–9, the winter counter-offensive) → Germany 5 / USSR 3 (rounds 10–14, Case Blue) → Germany 3 / USSR 4 (15+).
  - *France:* Germany 5; the Allies 2, then 3 from round 6.
  - *North Africa:* Axis 4 / Allies 2 until round 8; Axis 2 / Allies 5 from round 9 (El Alamein onwards).
  - The briefing shows the current initiative.
- **Fortresses (Historical):** Moscow (bunker 2), Leningrad (3), Berlin (2); the Maginot Line takes 35% damage instead of 50%; Tobruk (3) and El Alamein (2); Cologne (2).
- **Eastern Front (Historical):** bigger Siberian divisions (8 infantry, 3 artillery, 2 anti-tank) and a bigger Leningrad garrison.
- **France (both styles):** the **Westwall** — three fortified hexes on the German side facing the Maginot Line. The Allies now win outright by taking **Berlin** (was Cologne, only two hexes from Belgium).
- **North Africa (both styles):** the war starts after Operation Compass — the **Allies hold Benghazi and Derna**, Rommel starts from El Agheila (Afrika Korps HQ). Historical: a stronger Afrika Korps; Axis income falls to 70% from round 9 (supply collapse) while the Allies rise to 160%; the American tanks and Eighth Army reserves arrive at El Alamein; 16 rounds.
- **Engine fix:** scenario reinforcements now arrive **after** that round's upkeep is paid (before, a big reinforcement could force the player to disband units the moment it arrived — 16 units in one test game).
- **Bot fixes (all scenarios):** bots count bunkers and fortified lines when judging whether they can win a battle; keep 4 units in fortified/bunkered tiles they attack from; treat any city whose loss ends the war (capital, Paris, Berlin, …) like their capital (keep and reinforce its garrison); march armies sitting in the rear up to the front; reserve at least the upkeep actually due next round; value empty sea hexes less.
- **Results after the fixes (Historical, 2 players, bot-vs-bot):**

| | Real history | Simulation |
|---|---|---|
| Eastern Front | USSR wins; Moscow, Leningrad, Stalingrad hold; Minsk, Riga, Kiev, Smolensk fall in 1941 | USSR ~60% (19–13 over 32 games); Minsk/Riga/Kiev/Smolensk fall rounds 2–7; Moscow fell in 4/32, Stalingrad ~0, Leningrad about half |
| France | Germany wins; Paris falls ~week 6; the Maginot Line holds | Germany 16–0; Paris 15/16 (median round 7); Calais round 5; Maginot Line 1/16 |
| North Africa | Rommel takes Cyrenaica, Tobruk falls mid-1942, stopped at El Alamein; the Allies win | Allies 11–5; Benghazi taken round ~3, Tobruk sometimes falls (~round 5–6), the Axis reaches Mersa Matruh, never El Alamein; the Axis land share peaks ~round 9 and falls back |

- Bot results vary a lot between runs (two identical 16-game runs of the Eastern Front gave 11–5 and 8–8).
- **Balanced re-check after these changes** (bot-vs-bot, 16 games unless noted): Eastern Front 1v1 8–8, France 1v1 8–8, North Africa 1v1 7–7 (14 games, after re-tuning its Balanced income to Axis 95% / Allies 115% for the new starting line). Team games lean more: Eastern Front 2v2 3–13 (Germany–USSR), France 2v2 11–5; North Africa 2v2 not re-measured.

## ⚓ The Royal Navy (added 15 November 2026)
Britain's navy is why Germany could never cross the Channel — so every scenario with Britain now starts with it at sea (scenarios can now place **starting fleets** on sea hexes, held by the player with that region):
- **France 1940:** the Home Fleet — 2 battleships, 2 cruisers, 3 destroyers in the Channel; 2 cruisers + 3 destroyers and 1 battleship + 1 cruiser + 2 destroyers in the North Sea; a French squadron off Brest. Germany has 2 destroyers. The Allies start with cruisers and battleships researched. Any German crossing to Britain has to get past these ships (convoy interception).
- **North Africa 1941:** the Mediterranean Fleet off Alexandria (2 battleships, 2 cruisers, 3 destroyers), the ships keeping Tobruk supplied, and a squadron off Mersa Matruh. A small Italian squadron (Historical); in Balanced a real Italian fleet, paid for by 15 materials of supply from Italy every round.
- **Normandy 1944:** the invasion fleet (see below).
- **Shelling in scenarios:** a shell destroys a unit at **25%** of the normal chance (`shellPct`) — naval guns soften a coast but don't grind whole armies down. **Bunkers and fortified lines also shelter defenders from shelling** (same % as in battle; every Total War game).
- **Bots** treat enemy ships offshore as a threat when deciding how big a garrison their capital needs.

## ⚔ Historical scenario: Normandy, 1944 (added 15 November 2026)
- 🟫 **Germany** (OB West in Paris; the 7th Army in Normandy; the 15th Army in the Pas-de-Calais) vs 🟦 **the Allies** (Britain & Canada from London; the United States from Plymouth). 12 rounds (≈ a week each).
- **Map:** southern England, the Channel, Brittany, Normandy (Cherbourg, the beaches Utah, Omaha, Gold and Sword, Caen, the **bocage** hedgerow country as woods — slow for tanks), the Seine, Paris, the Pas-de-Calais and Belgium.
- **The Atlantic Wall:** bunkers along the coast — heaviest at the Pas-de-Calais (Calais level 3), Cherbourg, Omaha and Le Havre level 2 (Historical: Cherbourg 3 and Caen 2).
- **The invasion fleet:** 4 battleships, 8 cruisers and 17 destroyers — they shell the beaches and carry the landing troops (3 per ship).
- **Victory:** the Allies win by taking **Paris** (or holding 2 of Cherbourg / Caen / Paris at the end); Germany wins by holding 2 of the 3 at the end. (Taking London would also win for Germany.)
- **Off-map supply** (new scenario rule): a side can get a flat amount every round, shared by its players. The Allies get 30 (American production) — England alone couldn't pay for the invasion army.
- **Historical:** Allied initiative 5 attacks a round, Germany 2 then 3; Germany 75% income (Allied bombing), the Allies 150%; German panzer reserves (round 2), the 15th Army moves (4); Allied follow-up waves (3), Patton's Third Army (5), more Americans (7).
- **Bot results:** Historical — the Allies win 10/10; the beaches fall in rounds 1–2, Saint-Lô ~round 6, **Paris ~round 9–11** (it was liberated 11 weeks after D-Day). Cherbourg still falls too early (round 1; it held three weeks). Balanced (12 games): Allies 8–4 then re-tuned (supply 30).

## Balance after the navy (bot-vs-bot, Balanced)
- France 1v1: 7–5 (Germany's Balanced income raised to 140%, the Allies 115%).
- North Africa 1v1: **13–3 to the Allies** even with a bigger Axis economy (170%/90%) and an Italian fleet — the Royal Navy controls a coast where almost every hex is coastal. Without the Allied fleet the same setup was 5–3. Open question for the designers: keep the full Royal Navy in Balanced North Africa, or make it smaller there.
- Historical: France 10–0 Germany (unchanged); North Africa 10–0 Allies, Tripoli falling ~round 12 (the real campaign ended with Tripoli in January 1943).

## 🏳 Main capitals, and bots that defend them (added 16 November 2026)
- **Scenarios: taking the enemy's main capital** (Paris, Cairo, Moscow, Berlin, Tripoli, London) still wins the war at once — and now **the whole losing side's land surrenders with it**, every player on that side (their troops there lay down their arms). Regional HQs still don't surrender their region.
- **Bots pull back to defend** (every Total War game): when enemy units within 2 hexes of their capital — or, in a scenario, a city whose loss ends the war — outnumber its garrison, they march armies back to it (biggest stack first), and keep enough there to match the threat (threat + 2, at least 8). Other moves no longer pull those troops away again.
- Effect in bot-vs-bot games: in Historical France, Paris now falls in 2 of 8 games (was 15 of 16) — Germany still wins all 8, mostly on Brussels + Calais or points. Balanced (8 games each): Eastern Front 6–2 Germany, France 6–2 Germany, North Africa 3–5, Normandy 6–2 Allies.

## ⚠ Supply lines and ✈ bombing raids (added 16 November 2026)
**Supply lines** (`supplyLines`: on in historical scenarios by default; `always` or `off` in the lobby):
- **Supply sources:** your capital / HQ, ⚙ industrial cities, and **ports** — coastal cities (any coastal tile outside scenarios) next to a sea hex your side's ships hold.
- A land tile is **in supply** if it links to a source through land your side holds, within **6 hexes** (`supplyRange`). Teammates share supply.
- **Out of supply** (⚠ on the map, details in the tile menu): units fight at **75%** in battle (`supplyCombatPct`) — attackers if the tile they attack from is cut off, defenders if their tile is; you **can't recruit** there; after **2 rounds** cut off (`supplyAttritionRounds`) each stack there loses **1 unit a round** (the cheapest).
- So encircling an enemy spearhead on the map now hurts it, deep thrusts need a port or an industrial city along the way, and navies can supply (or starve) coastal armies.

**Bombing raids** (every Total War game): during Talk & Build, tap an enemy tile → ✈ *Bombing raid* — the bombers on one of your tiles within **3 hexes** (`bomberRange`) strike it. Each tile's bombers fly once a round.
- Each **anti-air gun and fighter** on the target fires first: **25%** each to shoot a bomber down (`airDefencePct`).
- Each bomber that gets through: **35%** to knock the target's **bunker down a level** (`bomberBunkerPct`); with no bunker, **25%** to destroy a unit (`bomberUnitPct`; less in a fortified line).
- Soften Tobruk, the Atlantic Wall or a bunkered capital before the assault — or put anti-air there to make raids costly.

**Bots:** fly raids at bunkered tiles next to their front (or big enemy stacks), don't recruit on cut-off tiles, and count supply when judging a battle.
**Bot-vs-bot after the change** (Balanced, 6 games each): Eastern Front 0–6 (Germany–USSR: German armies outrun their supply in Russia's depth), France 3–3, North Africa 1–5, Normandy 2–4. In one Historical Eastern Front game the bots flew 56 raids and lost units to supply 16 times.
- **Eastern Front re-balanced for supply (Balanced style):** supply reaches **9 hexes** (scenario styles can now set their own `supplyRange`) so Germany can fight at Moscow in supply, and **Germany wins at the end by holding any 1 victory city** (Historical still needs 2 of 3; styles can now override the end-of-game rule and its text). Before: 0–6 Germany–USSR; after: **8–7** (15 bot games — Germany 8 on holding a victory city; USSR 5 holding all 3, 2 by taking Berlin).
- **Historical Eastern Front with supply** (12 bot games): USSR 11–1. Minsk, Kiev fall rounds 2–4, Riga ~4, Smolensk ~7; Leningrad falls in 8/12 but is usually retaken; Moscow and Stalingrad never fall. Supply from Berlin, Silesia and Ploiești reaches about as far as Smolensk — taking a port (Riga, with ships off it) or an industrial city (Kharkov, Leningrad) is how Germany pushes its supply forward.

## 🌍 Europe 1939 — Phase 1: foundations (17 November 2026)
Planned: a big Europe 1939 map (1 round = 3 months, Sept 1939 → 1945), major *and* minor nations playable, 1–5 humans with historical bots, government/ideology with peaceful changes or civil wars (the breakaway half is a bot), a round newspaper with events, and steel / oil / manpower instead of wood / stone / sandbags in that mode.
Phase 1 (done):
- **War and War + Empire are hidden from the lobby** (the engine keeps them — Empire's puppet code will be reused for capitulations). Only Base and Total War are offered.
- **Speed for big maps:** a neighbour index (each tile's neighbours worked out once per board) replaces whole-board scans in supply, routes, sea transport, blockades, attack targets, general moves and the bots; sea-transport searches are shared across all targets in a view. On a 551-hex test map: building one player's view 141 ms → ~33 ms; a bot decision 200 ms → ~16 ms.
- **Save and resume:** the host's menu has **💾 Save game** (downloads the whole game as a .json file). In a new room, get the same number of players and bots in the lobby (in seat order), then **📂 Load saved game** — everyone takes over the seat at their position and play carries on from the same round. Saves from older versions get any newer settings filled in with defaults.

## 🌍 Europe 1939 — Phase 2: the map, nations and wars (17 November 2026)
Total War lobby → **Scenario: 🌍 Europe, 1939 (grand campaign)**.
- **23 nations, every one a player.** The host picks a nation for each human (1–5 humans; ★ = great power); bots play all the others (named after their nation). Great powers: Germany, the United Kingdom, France, the Soviet Union, Italy. Minors: Poland, Spain, Portugal, Ireland, Belgium, the Netherlands, Denmark, Norway, Sweden, Finland, the Baltic States, Switzerland, Hungary, Romania, Yugoslavia, Bulgaria, Greece, Turkey.
- **Map:** a stylised Europe with North Africa and Turkey — 30 × 20 hexes, ~410 land hexes, 63 named cities (industry, oil fields, victory points), terrain (Alps, Pyrenees, Carpathians, Balkans, Caucasus; Scandinavian and Russian forests; the Pripyat marshes), colonies (French and Italian North Africa, British Egypt), starting armies and fleets (the Royal Navy, the French and Italian fleets).
- **Time:** 1 round = 3 months, September 1939 → mid-1945 (24 rounds); the date is in the top bar.
- **Materials are steel, oil and manpower** (industrial cities make steel, oil fields oil, other land manpower). For now they're the same three materials renamed (any mix still pays for anything); oil requirements come later.
- **War and peace:** you can only attack, bomb or shell nations you are **at war** with. Tap a foreign tile → **⚔ Declare war**. **Factions** (Allies, Axis, Comintern) defend each other: declaring war on a member puts you at war with its whole faction (and your faction joins in). Start: Germany at war with Poland, Britain and France; the USSR invades eastern Poland on its own.
- **Capitulation:** a nation whose **capital** falls capitulates — all its land surrenders to the conqueror and it's out of the war (it no longer holds up any phase).
- **Attacks per round:** great powers 3, minor nations 1.
- **Every city is a supply depot** (colonies aren't cut off from the start).
- **The historical timeline** (only for nations played by bots — humans decide for themselves): the Soviet invasion of Poland (r1), the Winter War (r2), Denmark, Norway, the Low Countries (r3), Italy joins the Axis and attacks France (r4), the Baltic States (r4), Greece (r5), Hungary, Romania, Bulgaria join the Axis (r6–7), Yugoslavia and Greece (r7), the USSR joins the Allies and Barbarossa (r8), Finland joins the Axis (r8).
- **Victory:** the faction holding the most **victory points** (key cities) at the end.
- **Speed for many bots:** bots are only woken when they have something to do (no view built for idle bots), bot chat reactions are off in campaigns, bots pause 0.15 s instead of 0.9 s, recruit and upgrade in batches, the log is shared between game states instead of copied, views carry the last 500 log lines, and screens refresh at most ~6 times a second in campaigns. An all-bot round 1 (the busiest) went from ~35 s to ~14 s; later rounds ~5–7 s.
- **All-bot test (9 rounds):** Poland capitulates in round 3; Denmark, Norway, the Low Countries are invaded; Italy, Hungary, Romania, Bulgaria and Finland join the Axis; Barbarossa in round 8; the USSR takes Finland and the Baltic States. (Bots don't yet follow historical war plans — France isn't overrun — that's Phase 5.)
- Still to come: ideology, governments and civil wars (Phase 3); the round newspaper and event decisions (Phase 4); historical AI war plans (Phase 5); oil requirements for tanks, planes and ships.

## 🌍 Europe 1939 — Phase 3: ideology, government and civil war (17 November 2026)
- **Government and popularity:** each nation has a government (🗳 Democracy, ⚡ Fascism, ☭ Communism, 👑 Non-aligned) and a support % for each ideology (sums to 100), set from 1939 (Germany 80% fascist, Britain 85% democratic, the USSR 85% communist, many minors non-aligned monarchies). A government gains 1% support a round on its own (up to 90%).
- **Propaganda** (Turn drawer → 🏛 Politics): 4 materials for +5% to any ideology, at most twice a round. The points come from the biggest other ideologies.
- **Changing government:** with 50%+ support it's peaceful. With 30–49% it's a **civil war**: you keep the land nearest your capital (a share equal to the new ideology's support against the old one's); the rest breaks away as a new nation of the old regime — e.g. "France (Democracy)" — played by a bot, with half your materials, the units on its land plus a militia at its new capital (its biggest city), at war with you and in all your old wars. Below 30% you can't.
- **Factions accept only some governments:** Allies — democracies and non-aligned; Axis — fascists and non-aligned; Comintern — communists. A new government its faction won't accept leaves the faction; you can join any faction that accepts you and that you aren't at war with.
- **Democracies need a reason for war:** they can only declare war on a nation already at war with their faction or with another democracy.
- Bots never change government. Saves made after a civil war keep the breakaway nation (always a bot); older saves get 1939 governments when loaded.

## 🌍 Europe 1939 — Phase 4: the newspaper and event decisions (17 November 2026)
- **The Continental Herald:** at the start of every round a newspaper opens with the season's headlines since the last edition (wars, nations joining factions, capitulations, victory cities taken, civil wars, events), the most dramatic one as the front-page headline, and the faction standings. Reopen it from the 📰 date pill at the top.
- **Historical events are now decisions.** The fixed timeline became 18 events (the secret protocol, the Winter War, Weserübung, Case Yellow, Italy's hour, the Baltic ultimatum, Greece, Hendaye, the Tripartite Pact ×3, the Belgrade coup, Lend-Lease, Barbarossa, the Great Patriotic War, the Continuation War, America enters the war). Each offers a historical choice and an alternative (usually materials or troops instead of war). **Bots take the historical choice; a human player decides** — in the newspaper, before they can end the round. Some events wait for a condition (Italy only acts once France is fighting Germany; the USSR is offered the Allies once Germany attacks it, whenever that happens).
- Joining a faction through an event first makes peace with that faction's members (the USSR and the Polish government in exile, 1941).
- **Unrest:** a government below 40% support faces protests at most every 4 rounds — crack down (−3 materials, +8% support) or make concessions (+4%).
- **America enters the war** (December 1941): every Allied nation gets 8 materials.
- A bot that takes over a human's seat answers waiting decisions with the historical choice.

## 🌍 Europe 1939 — Phase 5: historical war plans for the bots (18 November 2026)
- **War plans** (`WAR_PLANS` in `engine/europe39.js`): for each bot nation and period, the cities it drives at, a **main thrust** where its armies mass (Germany: Poland → France and the Low Countries → the Soviet Union), cities it holds, cities it leaves alone, and whether it sits on the defensive (France behind the Maginot Line; the USSR during the pact and until the winter of 1942) or keeps to one theatre (Britain and Italy in North Africa).
- **How bots follow them:** spare units march over their own land to the front tiles nearest the main thrust's targets; attacks score higher the closer they are to plan targets; passive nations only win back their own land; held cities other than the capital keep a modest garrison (4–6) so they never swallow the army.
- **Doctrines** (for whoever plays the nation, human or bot): ⚡ **Blitzkrieg** — German attacks are 30% stronger until September 1941; ❄ **General Winter** — Soviet defenders are 25% stronger in winter rounds (December–February) from 1941. Shown in the campaign card.
- **Fixes:** single-hex nations (the Netherlands, Denmark, Switzerland) had no provinces, so their capitals could never be attacked — now they can. Two bot move rules could pass troops back and forth for ever (it hung a game in testing); each move now happens at most once a phase, with a cap of 80 moves.
- **All-bot results (24 rounds, several seeds):** Poland falls in round 2 (history: 1–2); Denmark and the Netherlands in round 3 (3); Belgium round 5 and Paris at the end of round 6 (history: round 4 — a season or two late, since armies advance one hex a round); Norway, the Baltic States, Finland, Yugoslavia and Greece knocked out; Barbarossa takes Minsk in round 10 and Kiev in round 13; the Soviets win Kiev back around round 17–20 (history: Nov 1943 = round 17); in some games the Red Army takes Berlin in round 22 and Germany capitulates (history: April 1945 = round 23). Germany doesn't reach Leningrad or Moscow — the eastern front settles around Minsk and Kiev.

## 🌍 Europe 1939 — oil (18 November 2026)
- **Fuel:** tanks, motorised and mechanised troops, self-propelled guns, planes and ships burn fuel — fuel points per unit (light tank 1, medium 2, heavy 3, bomber 2, battleship 3…), 1 oil per 4 points, paid at the start of every round before any other upkeep.
- **Where oil comes from:** oil-field land (Romania around Ploiești, the Caucasus around Baku) and **imports** each round — Germany 7 (synthetic fuel and Romanian oil), Britain 11 (the Empire and America), France 6, Italy 3 (it has almost none), the USSR 3 on top of its own fields, most minors 1.
- **Short of fuel:** tanks, motorised troops, planes and ships fight at between 50% (no fuel at all) and 100%, in proportion to the fuel paid; infantry, cavalry, guns are unaffected. A ⛽ Low fuel pill shows at the top, and the campaign card explains your fuel, imports and oil fields.
- **Allies share:** bot nations in your faction send spare oil (keeping 2) to a partner who is short — Romania fuels Germany once it joins the Axis.
- **Bots** only build or upgrade into machines their oil income (imports + fields) can run, keep the oil next round's fuel needs, and value oil fields as targets.
- **Factories beyond the Urals** (Soviet doctrine, from December 1941): +6 materials a round. Without it the fuel cap left the Red Army too weak and Germany took Moscow in some all-bot games.
- **All-bot results (24 rounds, 3 seeds):** the war in the west is unchanged (Paris rounds 7–8); every power stays mostly fuelled (Italy at ~75%, as historically); the USSR survives every game and the Red Army reaches Warsaw in rounds 21–23 (history: 21); Britain takes Tripoli (round 18) and Brussels (round 23). Leningrad tends to fall late in the war (it held historically).

## 🌍 Europe 1939 — France fights back, Britain an island, a faster map (18 November 2026)
- **France fights back.** A player rushing France took Paris in March 1940: the French bot sat passive with its army spread along the border and only ~6 units in Paris. Now, once enemy troops hold French land or an enemy army of 8+ masses on its border, the French bot rallies its armies on Paris and the hexes around it (up to ~16 in the city, then the ring), and the first invasion calls up the reserves (📰 *La patrie en danger*: +6 infantry in Paris, automatic for bot or human France). Against a simulated all-out rush from September 1939, Paris now holds ~30 units by December 1939 and falls in June 1940 — the historical date. The historical all-bot game is unchanged (Paris falls in round 8).
- **Britain is an island.** London touched Brest (armies could walk across the Channel) and Ireland touched England. Britain is now 12 hexes — the Highlands, Scotland, England widening south and east, the south-west at C8 and London in the south-east (E7) — with the Irish Sea and the Channel between it and its neighbours.
- **Faster map.** Every screen update rebuilt the whole page, including a 600-hex board of ~5,600 SVG elements (~200 ms each time, several times a second while bots moved). Now the board stays on the page and only the hexes whose markup changed are replaced; the rest of the screen is patched around it. Plain sea hexes and land hexes on big maps also drop the 🌊 glyph and tile-id labels (still in the tooltips). A redraw now takes ~15 ms.

## 🌍 Europe 1939 — stacking limit and the Soviet economy (18 November 2026)
- **Doom stacks.** A player marching on Moscow met 103 Soviet units on one hex. Two causes: the USSR's 137 hexes made it ~3× Germany's income (the Red Army reached ~178 units by 1943 in all-bot games), and a bot pulls every unit that can reach a threatened capital into it.
- **Stacking limit:** at most **30 land units of one nation on a hex** (Europe 1939, for everyone, players too). Recruiting or moving past it is refused with the room left; event troops that don't fit (mobilisation, civil-war militia) spill over to neighbouring hexes. Bots recruit on the nearest hex with room and never move more than a hex can take. The hex menu shows "Your units here: n / 30" and the campaign card explains the rule.
- **The Russian countryside yields half as much:** Soviet hexes that aren't cities or oil fields give 1 material per 4 hexes instead of 2 (whoever holds them). Soviet income at the start drops from ~97 to ~69 a round — still almost twice Germany's 37.
- **All-bot results (24 rounds, 3 seeds):** the Red Army peaks around 100 units (was 178); the eastern front swings back and forth around Minsk, Kiev and Riga; the USSR survives every game and retakes Warsaw in round 20 in two of three (history: 21). The west is unchanged (Paris rounds 7–8).

## 🌍 Europe 1939 — the national agenda (18 November 2026)
- **📋 Agenda** button in the bottom bar (campaigns): one project at a time, in four branches — ⚙ Industry, 🪖 Army, 🏛 Politics, 🤝 Diplomacy. You pay the cost when you start; it's done after 1–3 rounds. Some projects need another first. Starting a different one drops the current project (its cost is lost).
- **Shared projects:** Expand industry (+2 materials a round) → Synthetic fuel (+2 oil a round) / War economy (+4); Call up the reserves (+4 infantry) → Modern tactics (attacks +10%) / Defence in depth (defence +10%); Rally the nation (+8% support) → Ministry of information (+1% support a round) / Fortify the capital (a level-2 bunker); Trade agreements (+1 material, +1 oil); Join the Allies / Axis / Comintern (if they accept your government and you aren't at war with them).
- **⭐ National projects:** Germany — the Four-Year Plan, the Westwall; Britain — Shadow factories, the radar chain (defence +15%); France — Extend the Maginot Line; the USSR — the Five-Year Plan, Deep battle; Italy — Autarky.
- Finished projects stack with doctrines (Blitzkrieg + Modern tactics = attacks at 143%). Majors' completions make the newspaper.
- **Bots** work through a historical path (Germany: Four-Year Plan → reserves → Modern tactics → Westwall → industry…; Britain: Shadow factories → radar…; the USSR: Five-Year Plan → reserves → Defence in depth → Deep battle…) whenever they can spare the cost. All-bot games keep the historical arc (Paris round 8; the USSR survives; the eastern front swings around Minsk and Kiev).

## Battles — lasso selection (18 November 2026)
- With a mouse, hold the **right button and draw around** your units on the battlefield to select them all at once (Shift/Ctrl adds to the selection); then left-click where to send them. A dashed outline follows the cursor, a toast says how many units were picked, and the browser's right-click menu is blocked on the battlefield. Tapping units, the type buttons and Select all work as before (touch screens keep using those).
