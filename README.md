# Rising Tides — online playtest

An online version of **Rising Tides**, our JA Company Programme board game, for 3–5 players on phones or laptops. It's for our own playtesting only, not for sale.

- The host creates a room and shares a 4-letter code or link. Everyone else opens the link, types a name and joins. No accounts, no installs.
- **Modes:** Base, War (territories, militia, the Climate Accord), War + Empire (puppets, tribute, revolts), and **⚔ Total War** — a just-for-fun mode where war is the point: 18 rounds, militia / infantry / cavalry, and **live battles** where you move your units on a battlefield and encircle the enemy. The host picks one in the lobby.
- **Every number in the rules** can be changed in the lobby before a game starts (defaults live in `config.js`).

---

## 1. Play on your own computer (5 minutes)

You need **Node.js**, a free program that runs the game server.

1. Install Node.js: go to <https://nodejs.org>, download the **LTS** version and install it with the default options.
2. Download this project folder and unzip it somewhere easy, for example your Desktop.
3. Open a terminal in the folder:
   - **Windows:** open the `rising-tides` folder, click the address bar, type `cmd` and press Enter.
   - **Mac:** right-click the `rising-tides` folder → *New Terminal at Folder*.
4. Type these two commands, pressing Enter after each:

   ```bash
   npm install
   ```

   ```bash
   npm start
   ```

5. Open **http://localhost:3000** in your browser. Type your name and press **Create a room**.

To stop the server, click the terminal window and press **Ctrl + C**.

**Friends on the same Wi-Fi** can join too. Find your computer's local address (Windows: run `ipconfig` and look for "IPv4 Address", e.g. `192.168.1.23`). Friends then open `http://192.168.1.23:3000` on their phones. If that doesn't work, your firewall may be blocking it. Deploying online (below) is easier.

---

## 2. Put it online for free (so friends can join from home)

We use **Render** (free plan). You do this once; after that, Render updates the game whenever you change the code on GitHub.

### Step A — Put the code on GitHub
1. Make a free account at <https://github.com>.
2. Click **+** (top right) → **New repository**. Name it `rising-tides`, leave it **Public** or **Private**, and click **Create repository**.
3. On the new page, click **uploading an existing file**. Drag in everything inside the `rising-tides` folder **except the `node_modules` folder**, then click **Commit changes**.

### Step B — Deploy on Render
1. Make a free account at <https://render.com> (sign up with your GitHub account; it's easiest).
2. Click **New +** → **Web Service** → choose your `rising-tides` repository.
3. Fill in:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. Click **Create Web Service**. Wait a few minutes until it says **Live**.
5. Your game is at the address Render shows, like `https://rising-tides-abcd.onrender.com`. Bookmark it.

> ⏰ **Important: the free server goes to sleep.** After about 15 minutes with nobody playing, Render puts the free server to sleep. The first visit after that takes **about a minute** to wake it up.
> **The host should open the link a minute or two before playtesting starts**, then create the room once the page loads.
>
> Rooms are kept in the server's memory, so **a sleeping or restarted server forgets all rooms**. Don't leave a game half-finished overnight.

---

## 3. Playing a game

1. **Host:** open the site, type your name, press **Create a room**.
2. Press **Share link** and send it to the group (or just read out the 4-letter code).
3. **Everyone else:** open the link, type a name, press **Join room**.
4. **Host:** pick the mode and change any settings, then press **Start game** (needs 3–5 players).
   - **Seats:** seat 1 is the first starting player, and play goes clockwise in seat order. Use ▲▼ or **Shuffle seats**.
   - **Biomes:** random by default, or choose **Host picks** to set each player's biome.
5. The map fills the screen. The top bar shows the round, the phase, the Flood and your materials; rivals are banners on the map (tap one for details). **Tap any tile** for what you can do there (recruit, move troops, attack, build a factory). The dock at the bottom opens panels — 🎯 **Turn**, 🏗️ **Build**, 🤝 **Trade**, 🌊 **Flood**, 📜 **Log**, 💬 **Chat** — and the red **End turn** button marks you Ready (or opens your secret choice). Big events pop up as short notes; the full story is in the Log.

**Testing on your own? Add bots.** In the lobby the host can press **🤖 Add bot** to fill empty seats (3 players minimum, so you plus 2 bots works). Each bot has a personality you can change in the lobby:
- **cautious** — builds walls, rarely fights, donates to the seawall when the Flood gets close;
- **balanced** — a mix;
- **warlike** — raids, recruits big armies and attacks whenever it expects to win.

Bots play every mode, answer your trade offers (they accept if they get at least as much as they give), follow or revolt against Empire commands, and only see what a human in their seat could see. Change **"Bot thinking time"** in the General settings to speed them up (0 = instant) or slow them down. The playtest CSV marks bot players in a `bot` column so you can filter them out.

**🏭 Factories (Base game, from our in-person playtest — on by default).** The Flood starts at **5**.
- In Talk & Build or Trade & Build, open **Factories** in the 🏗️ Build panel (or tap an empty tile next to your land): pick 🌿 **Sustainable** (costs more, makes 1 a round) or 🏭 **Unsustainable** (cheap, makes 2 a round), pick a tile, press **Build**. You can build on your home tile or an empty tile next to your home or one of your factories — that's how you spread across the board.
- Every factory makes its tile's resource every round, whatever action you choose.
- Each 🏭 unsustainable factory adds **+1 Flood every round** it stands, and nobody may own more than 3. For every **3 🌿 sustainable factories on the board (everyone's together)** the Flood **drops 1** every round — so if the group cooperates, the Flood goes down. You can demolish your own factory any time you're building.
- **Claim a factory** replaces Raid: pay 1 wood, you and the owner each roll a die, higher wins (ties to the owner), and the factory becomes yours. Factories on someone's home tile can't be claimed.
- All of the numbers are in the lobby's Base settings, and the host can switch factories off to play the original rulebook (Flood 2, raids).

**⚔ Total War battles.** When your attack meets defenders (or someone attacks your defended land), the Turn panel widens into a battlefield. Tap one of your units — ● militia, ■ infantry, ▲ cavalry — to select it (tap it again to unselect), or use *Select all* / a type button; turn on **Add to selection** (or hold Shift) to pick several. Then tap where to send them. Attackers win by holding the flag ⚑ alone for a few seconds; defenders win by holding out. Units cut off from their own edge of the map (red dashed outline) take heavy damage and surrender, so swing cavalry round behind the enemy. Press **Auto-battle** to let the computer fight for you. Other players' battles can be watched live.

**⚔ Total War: research, air, sea and formations.** Total War is played on a bigger board (37 hexes) with six **sea bays** 🌊 between the players.
- **Research** (🏗️ Build panel → 🔬 Research): pay once during Talk & Build; it's ready at the start of next round. One project at a time.
  - Artillery → Light tanks → Medium tanks → Heavy tanks.
  - Motorised infantry → Mechanised infantry → Aircraft (interceptors and bombers).
  - Anti-tank guns, and Anti-air guns.
  - Shipyards → Cruisers → Battleships.
- **Upgrade** units you already have (⬆ Upgrade units) by paying the difference in cost:
  - militia → anti-tank or anti-air;
  - infantry → motorised → mechanised;
  - cavalry → light → medium → heavy tank;
  - destroyer → cruiser → battleship.
- **Matchups:** tanks shrug off rifle fire but anti-tank guns shred them. Only anti-air and aircraft can hit planes. Artillery, anti-air, cruisers and battleships fire at range.
- **Ships** are launched into a sea bay next to your coast and can sail to any bay. Attacking a bay held by enemy ships starts a live **naval battle**. Holding a bay lets your coastal troops **land across it** (amphibious attack), and your cruisers and battleships **shell** any coastal battle next to that bay.
- **Aircraft:** if both sides bring planes to a fight, a live **air battle** comes first. The winner's bombers then fly over the ground battle, where only anti-air can shoot them down. Planes always fly back to base afterwards.
- **Formations:** during a battle, pick one with the Formation buttons, or **Free** for no formation. Picking one arranges your whole army and gives a bonus. Which ones you get depends on your units:
  - Line;
  - Defensive square;
  - Wedge (fast units);
  - Pincer (4+ units);
  - Armour spearhead (tanks);
  - Combined arms (infantry + armour + guns);
  - Artillery screen (artillery).

  You can switch at any time. **Auto-battle** picks formations for you and changes them as the fight turns (for example, closing into a square when surrounded).
- All of the numbers are lobby settings: every unit's stats, the research costs and the formation bonuses.

**Diplomacy (🤝 Trade panel).**
- **Pacts** are promises: offer a player a non-aggression pact or an alliance against someone for 1–3 rounds. The game never stops anyone breaking a pact — but it announces it to everyone and marks the betrayer.
- **Treaties** (switch on "Treaties" in the lobby's General settings) are binding: write rules like "no more than 2 militia" or "no Unsustainable development", invite players, and once two have signed the game blocks any move that breaks them. To get out you must openly break the treaty: everyone sees it and you lose 3 materials (adjustable).
- Bots join in: they offer and answer pacts, sign or refuse treaties, send trade offers and chat. Talk to them in the chat using their name or "everyone" with words like *peace*, *pact*, *trade*, *flood* or *attack*.

**Refreshed by accident or lost connection?** Open the link again. You'll usually be put straight back into your seat. If not, type the room code and **exactly the same name** as before.

**Host controls** (the **Host ▾** button at the top during a game):
- **Pause / Resume** — nobody can act while paused.
- **Skip [name]** — for a stuck or disconnected player: marks them Ready, plays Sustainable for them, or picks their raid loot at random.
- **End game** — scores the game now, at the current Flood.

If the host is away for more than 60 seconds, another player becomes host automatically.

**War and War + Empire, quickly:**
- Each player has a capital and two provinces. The map shows who owns and who holds every tile (⚑P2 = held by player 2), plus units ⚔, Damaged 🩹, sanctioned ⛔, puppet ⛓ and overlord 👑.
- **Units are stationed on tiles** (like Risk): the board shows ⚔N on each tile. Recruit from the 🏗️ Build panel (or tap your tile → Recruit here) during Talk & Build and pick where the new units go; use **Move units** to shift them between your tiles (as often as you like). Only units on a tile defend it — an empty tile falls to any attack. The host can turn this off in the lobby ("Units are stationed on tiles") to play with one army that defends everywhere.
- To attack, choose **Attack**, pick a target (from the list, or tap the tile on the map → Attack), then pick which of your tiles to attack **from** and how many units to send. If you win a province, your surviving units move in.
- **Income:** every tile you hold gives 1 of its resource every round, whatever you play — even when you attack. Sustainable adds +2 of your home resource; Unsustainable adds +6 of anything (Flood +1). So conquering tiles raises your income for the rest of the game.
- Occupying tiles no longer raises the Flood; each attack still does (+1). A capital can be attacked once one of its provinces has fallen.
- **War always pollutes:** big armies add Flood every round (+1 per 5 units you own), and every 2 units destroyed in battle add +1 more. The 🏗️ Build panel shows what your army will add next upkeep.
- The Flood track shows the **Climate Accord** line (🤝 at 10). While it holds, attackers are sanctioned and victims get aid. Once it breaks (💔) it's gone for good.
- Empire: overlords command their puppets in the 🏗️ Build panel (**Your puppets**). Puppets see their command and a **Revolt!** card.
- Withdrawing from a tile and freeing a puppet are set up during Trade & Build and happen at the next upkeep.

**After the game**, the end screen shows who survived, the scores and the winner. Press **Download CSV** to save the playtest record (opens in Excel or Google Sheets, one row per player) or **Download JSON** (also includes every setting used).

---

## 4. Changing the rules

- **For one game:** the host changes settings in the lobby. Changed values are marked bold and show the default next to them.
- **For everyone, permanently:** edit `config.js`. Every number has a comment saying what it does. Restart the server afterwards (Ctrl + C, then `npm start`; on Render, commit the change on GitHub and Render redeploys).
- How unclear rules were decided: see [RULE_NOTES.md](RULE_NOTES.md).

---

## 5. Updating the online version

When the code changes (like adding War and Empire), upload the changed files to GitHub again:
1. On your repository page, click **Add file → Upload files**.
2. Drag in everything inside `rising-tides` again (folders included, not `node_modules`). GitHub replaces files with the same name.
3. Click **Commit changes**.

If you connected Render through **Git Provider → GitHub**, it redeploys by itself in a few minutes. If you used **Public Git Repository**, open your service on Render and click **Manual Deploy → Deploy latest commit**.

---

## 6. For the programmers on the team

```
config.js            every number + lobby labels and limits
engine/              the rules — pure functions, no networking
  index.js           createGame, applyAction (state + action -> new state), viewFor (what one player may see)
  base.js            Base rules: phases, walls, market, seawall, trades, raids, scoring, host skip
  war.js             War + Empire: upkeep, militia, attacks, clashes, Accord, puppets, revolts
  diplomacy.js       pacts (recorded, never enforced) and treaties (enforced)
  totalwar.js        Total War live battles: terrain, movement, flanking, encirclement
  board.js           biomes, home tiles, territories
  layouts.js         board layouts as data (hex coordinates)
  record.js          playtest record (JSON + CSV)
  util.js            materials helpers, seeded dice, event log
server/
  index.js           Express web server + Socket.IO
  rooms.js           rooms, lobby, rejoining, host controls, loot timer, running bots
  bots.js            computer players: decide(view) -> next action, with personalities
public/              the web page (plain HTML/CSS/JS, no build step)
  js/app.js          connection, state, button handlers
  js/lobby.js, game.js, war-ui.js, diplomacy-ui.js, battle-ui.js, board.js, dice.js, end.js, log.js, landing.js, ui.js
test/                unit tests (node:test) + an end-to-end server test
```

- **Run the tests:** `npm test` (about a minute). Run them after changing any rule. The random-games test plays 15 random games per mode; run more with `RANDOM_GAMES=100 npm test` (Mac/Linux) before a big playtest.
- **The server is the referee.** The browser only sends requests like `{ type: 'buildWall' }`. The engine checks every one and throws a `RuleError` if it isn't allowed, so editing the web page can't cheat.
- **Dice** are rolled on the server from a seeded random generator stored in the game state. Players never receive the seed, so they can't predict rolls.
- **Secret choices** are removed from other players' views (`viewFor`) until everyone has chosen.
- To add a rule: add a handler in `engine/base.js` (or a new file), add it to `handlers`, write a test, then add a button in `public/js/game.js` that calls `act({ type: 'yourAction' })`.
