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
