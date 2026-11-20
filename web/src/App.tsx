import { useMemo, useState } from "react";
import { Bug, Coin, CropIcon, CROP_NAMES, Dog, Drop, Plant, type Stage, Weed } from "./art/crops";
import type { Move } from "./chain/farm";
import { type Catalog, type FarmView, KIND_DRY, KIND_PEST, KIND_WEED, type PlotView } from "./chain/rules";
import { type Game, useGame } from "./game";

type Drawer = "seeds" | "barn" | "neighbours" | "rules" | undefined;
type VisitTool = "hand" | "weed" | "pest";

const KIND_VERB = ["除草", "除虫", "浇水"];
/** Why a ripe plot gives a visitor nothing, by rule error code. */
const WHY_NOT: Record<number, string> = { 29: "你摘过了", 30: "给主人留着", 31: "狗守着" };
const num = (n: number) => n.toLocaleString("zh-CN");

function span(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}小时${Math.floor((s % 3600) / 60)}分`;
  if (s >= 60) return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`;
  return `${s}秒`;
}

function describe(move: Move, game: Game): string {
  const a = move.action;
  const at = "plot" in a ? `${a.plot + 1}号地` : "";
  const whose = move.farm === game.mine?.id ? "" : `${game.look(game.farms.find((f) => f.id === move.farm), false)?.name || "邻居"}：`;
  switch (a.op) {
    case "buy":
      return `买${CROP_NAMES[a.crop]}种子 ×${a.count}`;
    case "plant":
      return `${at}种${CROP_NAMES[a.crop]}`;
    case "harvest":
      return `收获${at}`;
    case "shovel":
      return `铲除${at}`;
    case "sell":
      return `卖${CROP_NAMES[a.crop]} ×${a.count}`;
    case "expand":
      return "开垦新地";
    case "feedDog":
      return "喂狗";
    case "clear":
      return `${at}${KIND_VERB[a.kind]}`;
    case "rename":
      return `改名为「${a.name}」`;
    case "help":
      return `${whose}帮${at}${KIND_VERB[a.kind]}`;
    case "mischief":
      return `${whose}往${at}${a.kind === KIND_WEED ? "放草" : "放虫"}`;
    case "steal":
      return `${whose}摘${at}`;
  }
}

function stageOf(plot: PlotView, now: number): Stage {
  if (plot.withered) return "withered";
  if (plot.pending) return "seed";
  if (plot.ripe) return "ripe";
  const grown = (now - plot.plantedAt) / Math.max(1, plot.duration);
  return grown < 0.12 ? "seed" : grown < 0.5 ? "sprout" : "leafy";
}

export function App() {
  const game = useGame();
  const [drawer, setDrawer] = useState<Drawer>();
  const [seed, setSeed] = useState(1);
  const [tool, setTool] = useState<VisitTool>("hand");

  if (game.phase.at === "loading" || (game.phase.at === "ready" && !game.loaded)) {
    return (
      <Shell game={game}>
        <p className="notice">正在读取链上的田地…</p>
      </Shell>
    );
  }
  if (game.phase.at === "broken") {
    return (
      <Shell game={game}>
        <div className="card notice-card">
          <h2>{game.phase.why}</h2>
          {game.phase.hint && <p>{game.phase.hint}</p>}
          <button className="btn" onClick={() => location.reload()}>
            重新连接
          </button>
        </div>
      </Shell>
    );
  }
  const catalog = game.catalog!;
  if (!game.mine) {
    return (
      <Shell game={game}>
        <Claim game={game} />
      </Shell>
    );
  }

  const mine = game.look(game.mine, true)!;
  const away = game.visited ? game.look(game.visited, true) : undefined;
  const shown = away ?? mine;
  const me = (action: Move["action"]): Move => ({ farm: game.mine!.id, action });
  const them = (action: Move["action"]): Move => ({ farm: game.visited!.id, action });

  /** Plants `seed` on the plots, buying what the bag is short of and the purse allows. */
  const sow = (plots: number[]) => {
    const info = catalog.crops[seed - 1];
    const have = mine.seeds[seed - 1];
    const buy = Math.min(Math.max(0, plots.length - have), Math.floor(mine.gold / info.seedPrice));
    const count = Math.min(plots.length, have + buy);
    if (count === 0) return game.toast("bad", `金币不够买${CROP_NAMES[seed]}种子`);
    const moves: Move[] = buy > 0 ? [me({ op: "buy", crop: seed, count: buy })] : [];
    plots.slice(0, count).forEach((plot) => moves.push(me({ op: "plant", plot, crop: seed })));
    game.add(...moves);
  };

  const chores = (plot: PlotView, index: number, as: "clear" | "help") =>
    plot.problems.flatMap((p, kind) => (p ? [{ op: as, plot: index, kind } as Move["action"]] : []));

  const onPlot = (index: number) => {
    const plot = shown.plots[index];
    if (away) {
      if (!plot.crop) return game.toast("info", "这块地是空的");
      const p = plot as PlotView;
      if (tool !== "hand") {
        return game.add(them({ op: "mischief", plot: index, kind: tool === "weed" ? KIND_WEED : KIND_PEST }));
      }
      if (p.steal > 0) return game.add(them({ op: "steal", plot: index }));
      const help = chores(p, index, "help");
      if (help.length) return game.add(...help.map(them));
      if (p.ripe) return game.add(them({ op: "steal", plot: index })); // says why not
      return game.toast("info", p.withered ? "已经枯萎了" : "长势不错，没什么要帮忙的");
    }
    if (!plot.crop) return sow([index]);
    const p = plot as PlotView;
    if (p.withered) return game.add(me({ op: "shovel", plot: index }));
    const fix = chores(p, index, "clear");
    if (fix.length) return game.add(...fix.map(me));
    if (p.ripe) return game.add(me({ op: "harvest", plot: index }));
    game.toast("info", p.pending ? "种子刚下地，等区块确认" : `${CROP_NAMES[p.crop]}还要 ${span(p.ripeAt - game.now)}`);
  };

  const plots = shown.plots.map((plot, index) => ({ plot, index }));
  const growing = plots.filter((x) => x.plot.crop) as { plot: PlotView; index: number }[];
  const batch = away
    ? {
        摘取: growing.filter((x) => x.plot.steal > 0).map((x) => them({ op: "steal", plot: x.index })),
        帮忙: growing.flatMap((x) => chores(x.plot, x.index, "help").map(them)),
      }
    : {
        收获: growing.filter((x) => x.plot.ripe && !x.plot.problems.some(Boolean)).map((x) => me({ op: "harvest", plot: x.index })),
        打理: growing.filter((x) => !x.plot.withered).flatMap((x) => chores(x.plot, x.index, "clear").map(me)),
        铲除: growing.filter((x) => x.plot.withered).map((x) => me({ op: "shovel", plot: x.index })),
      };
  const empty = plots.filter((x) => !x.plot.crop).map((x) => x.index);
  const next = mine.land < catalog.maxPlots ? catalog.expand[mine.land - catalog.initPlots] : undefined;

  return (
    <Shell game={game} farm={mine}>
      <main className="scene">
        <div className="sign">
          {away ? (
            <>
              <span className="sign-name">{away.name || "无名农场"}</span>
              <span className="sign-sub">{away.level} 级，你在这里做客</span>
              <button className="btn small" onClick={() => game.visit(undefined)}>
                回自己的农场
              </button>
            </>
          ) : (
            <>
              <span className="sign-name">{mine.name || "我的农场"}</span>
              <button
                className="link"
                onClick={() => {
                  const name = prompt("给农场起个名字", mine.name)?.trim();
                  if (name) game.add(me({ op: "rename", name }));
                }}
              >
                改名
              </button>
            </>
          )}
        </div>

        <div className="quick">
          {Object.entries(batch).map(([label, moves]) => (
            <button key={label} className="btn small" disabled={moves.length === 0} onClick={() => game.add(...moves)}>
              全部{label}
              {moves.length > 0 && <b>{moves.length}</b>}
            </button>
          ))}
          {!away && (
            <button className="btn small" disabled={empty.length === 0} onClick={() => sow(empty)}>
              空地全种{CROP_NAMES[seed]}
            </button>
          )}
          {away && (
            <span className="tools" role="group" aria-label="做客时用的工具">
              {(["hand", "weed", "pest"] as const).map((t) => (
                <button key={t} className={`btn small ${tool === t ? "on" : ""}`} aria-pressed={tool === t} onClick={() => setTool(t)}>
                  {t === "hand" ? "摘取和帮忙" : t === "weed" ? "放草" : "放虫"}
                </button>
              ))}
            </span>
          )}
        </div>

        <div className="field">
          {plots.map(({ plot, index }) => (
            <PlotTile key={index} plot={plot} index={index} now={game.now} away={!!away} onClick={() => onPlot(index)} />
          ))}
          {!away && next && (
            <button
              className="plot locked"
              onClick={() => game.add(me({ op: "expand" }))}
              disabled={mine.level < next.level || mine.gold < next.price}
            >
              <span className="locked-title">开垦这块地</span>
              <span className="locked-cost">
                <Coin size={16} /> {num(next.price)}
              </span>
              <span className="locked-cost">需要 {next.level} 级</span>
            </button>
          )}
        </div>

        <Kennel farm={shown} game={game} away={!!away} catalog={catalog} onFeed={() => game.add(me({ op: "feedDog" }))} />
      </main>

      <Basket game={game} />

      <nav className="dock" aria-label="农场菜单">
        <button className={`dock-btn ${drawer === "seeds" ? "on" : ""}`} onClick={() => setDrawer(drawer === "seeds" ? undefined : "seeds")}>
          <CropIcon id={seed} size={34} />
          <span>种子</span>
        </button>
        <button className={`dock-btn ${drawer === "barn" ? "on" : ""}`} onClick={() => setDrawer(drawer === "barn" ? undefined : "barn")}>
          <BarnIcon />
          <span>仓库</span>
          {mine.fruits.some(Boolean) && <b className="dot">{num(mine.fruits.reduce((a, b) => a + b, 0))}</b>}
        </button>
        <button className={`dock-btn ${drawer === "neighbours" ? "on" : ""}`} onClick={() => setDrawer(drawer === "neighbours" ? undefined : "neighbours")}>
          <FenceIcon />
          <span>邻居</span>
          {game.farms.length > 1 && <b className="dot">{game.farms.length - 1}</b>}
        </button>
        <button className={`dock-btn ${drawer === "rules" ? "on" : ""}`} onClick={() => setDrawer(drawer === "rules" ? undefined : "rules")}>
          <BookIcon />
          <span>规则</span>
        </button>
      </nav>

      {drawer && (
        <aside className="drawer" aria-label="面板">
          <button className="drawer-close" onClick={() => setDrawer(undefined)} aria-label="关闭">
            ×
          </button>
          {drawer === "seeds" && <Seeds catalog={catalog} farm={mine} seed={seed} pick={setSeed} />}
          {drawer === "barn" && <Barn catalog={catalog} farm={mine} sell={(crop, count) => game.add(me({ op: "sell", crop, count }))} />}
          {drawer === "neighbours" && (
            <Neighbours
              game={game}
              go={(id) => {
                game.visit(id);
                setTool("hand");
                setDrawer(undefined);
              }}
            />
          )}
          {drawer === "rules" && <Rules catalog={catalog} game={game} />}
        </aside>
      )}
    </Shell>
  );
}

function Shell({ game, farm, children }: { game: Game; farm?: FarmView; children: React.ReactNode }) {
  const ckb = game.balance === undefined ? "…" : num(Math.floor(Number(game.balance / 100_000_000n)));
  return (
    <div className="app">
      <header className="hud">
        <div className="brand">
          <span className="brand-name">垄上</span>
          <span className="brand-sub">{game.network.name}上的农场</span>
        </div>
        {farm && (
          <div className="stats">
            <div className="level" title={`经验 ${num(farm.exp)} / ${num(farm.levelTo)}`}>
              <span className="level-n">{farm.level}</span>
              <span className="level-word">级</span>
              <span className="bar">
                <i style={{ width: `${(100 * (farm.exp - farm.levelFrom)) / (farm.levelTo - farm.levelFrom)}%` }} />
              </span>
            </div>
            <div className="gold" title="金币">
              <Coin size={22} />
              <span>{num(farm.gold)}</span>
            </div>
          </div>
        )}
        <div className="wallet">
          <label>
            <span className="sr">账户</span>
            <select value={game.accountIndex} onChange={(e) => game.setAccountIndex(Number(e.target.value))} disabled={!!game.busy}>
              {game.accounts.map((a, i) => (
                <option key={a.key} value={i}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <span className="ckb" title={game.address}>
            {ckb} CKB
          </span>
        </div>
      </header>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {game.busy && <div className="toast busy">{game.busy}</div>}
        {game.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Claim({ game }: { game: Game }) {
  const [name, setName] = useState("");
  const poor = game.balance !== undefined && game.balance < 400n * 100_000_000n;
  return (
    <form
      className="card claim"
      onSubmit={(e) => {
        e.preventDefault();
        game.create(name.trim() || "我的农场");
      }}
    >
      <div className="claim-art">
        <Plant crop={6} stage="ripe" />
      </div>
      <h1>开垦一块自己的地</h1>
      <p>
        农场是一个存在 CKB 链上的格子，占用约 332 CKB，随时可以由你收回。六块地、{num(game.catalog?.initGold ?? 500)} 金币起步，之后的每一次播种、收获和串门都由链上合约按同一套规则验算。
      </p>
      <label className="field-label" htmlFor="farm-name">
        农场的名字
      </label>
      <input id="farm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="我的农场" maxLength={18} autoFocus />
      <button className="btn big" disabled={!!game.busy || poor}>
        {game.busy ?? "开垦农场"}
      </button>
      {poor && (
        <p className="warn">
          这个账户的 CKB 不够。{game.network.faucet ? <a href={game.network.faucet} target="_blank" rel="noreferrer">去水龙头领取测试币</a> : "换一个测试账户试试。"}
          {game.address && <code>{game.address}</code>}
        </p>
      )}
    </form>
  );
}

function PlotTile({ plot, index, now, away, onClick }: { plot: FarmView["plots"][number]; index: number; now: number; away: boolean; onClick: () => void }) {
  if (!plot.crop) {
    return (
      <button className="plot empty" onClick={onClick} aria-label={`${index + 1}号地，空地`}>
        <span className="soil" />
        {!away && <span className="hint">点一下播种</span>}
      </button>
    );
  }
  const p = plot as PlotView;
  const stage = stageOf(p, now);
  const dry = !!p.problems[KIND_DRY];
  const status = p.withered
    ? "已枯萎"
    : p.pending
      ? "刚播下"
      : p.ripe
        ? away
          ? p.steal > 0
            ? `可摘 ${p.steal}`
            : (WHY_NOT[-p.steal] ?? "熟了")
          : `可收 ${p.harvest}`
        : span(p.ripeAt - now);
  return (
    <button className={`plot ${stage} ${dry ? "dry" : ""} ${p.pending ? "pending" : ""}`} onClick={onClick} aria-label={`${index + 1}号地，${CROP_NAMES[p.crop]}，${status}`}>
      <span className="soil" />
      <Plant crop={p.crop} stage={stage} />
      <span className="pests">
        {!!p.problems[KIND_WEED] && <Weed />}
        {!!p.problems[KIND_PEST] && <Bug />}
        {dry && <Drop />}
      </span>
      {p.stolen > 0 && <span className="stolen">被摘 {p.stolen}</span>}
      <span className={`tag ${p.ripe ? "ripe" : ""}`}>
        <b>{CROP_NAMES[p.crop]}</b>
        {status}
        {p.season > 0 && !p.withered && <i>第{p.season + 1}季</i>}
      </span>
    </button>
  );
}

function Kennel({ farm, game, away, catalog, onFeed }: { farm: FarmView; game: Game; away: boolean; catalog: Catalog; onFeed: () => void }) {
  const awake = farm.dogUntil > game.now;
  const can = farm.level >= catalog.dogLevel;
  return (
    <div className="kennel">
      <Dog awake={awake} size={58} />
      <div className="kennel-text">
        <b>{awake ? `看门狗站岗中，还有 ${span(farm.dogUntil - game.now)}` : "看门狗饿着，不看门"}</b>
        <span>
          {away
            ? awake
              ? `它会拦下你在大约${catalog.dogBlockPercent}%的地里伸出的手`
              : "现在摘菜没有狗管"
            : can
              ? `喂一次管一整天（${span(catalog.hoursPerDay * game.chain!.unit)}），能挡住约${catalog.dogBlockPercent}%的偷摘`
              : `${catalog.dogLevel} 级后可以喂狗看门`}
        </span>
      </div>
      {!away && (
        <button className="btn small" disabled={!can || farm.gold < catalog.dogFoodPrice} onClick={onFeed}>
          喂狗 <Coin size={14} /> {catalog.dogFoodPrice}
        </button>
      )}
    </div>
  );
}

function Basket({ game }: { game: Game }) {
  if (game.basket.length === 0) return null;
  const dropped = new Map(game.sifted?.dropped.map((d) => [d.move, d.reason]));
  const ready = game.basket.length - dropped.size;
  return (
    <section className="basket" aria-label="待上链的操作">
      <div className="basket-list">
        {game.basket.map((move, i) => (
          <span key={i} className={`chip ${dropped.has(move) ? "bad" : ""}`} title={dropped.get(move)}>
            {describe(move, game)}
            <button onClick={() => game.remove(i)} aria-label="撤销这一步" disabled={!!game.busy}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="basket-actions">
        <button className="link" onClick={game.clear} disabled={!!game.busy}>
          全部撤销
        </button>
        <button className="btn big" onClick={() => game.send()} disabled={!!game.busy || ready === 0}>
          {game.busy ?? `上链，${ready} 个操作一笔交易`}
        </button>
      </div>
    </section>
  );
}

function Seeds({ catalog, farm, seed, pick }: { catalog: Catalog; farm: FarmView; seed: number; pick: (id: number) => void }) {
  return (
    <>
      <h2>种子</h2>
      <p className="drawer-note">选一种拿在手里，点空地就种下。袋里没有会顺手买一颗。</p>
      <ul className="list">
        {catalog.crops.map((c) => {
          const locked = farm.level < c.level;
          return (
            <li key={c.id}>
              <button className={`row ${seed === c.id ? "on" : ""}`} disabled={locked} aria-pressed={seed === c.id} onClick={() => pick(c.id)}>
                <CropIcon id={c.id} size={44} />
                <span className="row-main">
                  <b>{CROP_NAMES[c.id]}</b>
                  <span>
                    {c.growHours} 小时成熟，收 {c.yield} 个{c.seasons > 1 ? `，共 ${c.seasons} 季` : ""}
                  </span>
                  <span>
                    每个卖 {c.sellPrice}，经验 +{c.exp}
                  </span>
                </span>
                <span className="row-side">
                  {locked ? (
                    <i>{c.level} 级解锁</i>
                  ) : (
                    <>
                      <span className="price">
                        <Coin size={14} /> {num(c.seedPrice)}
                      </span>
                      {farm.seeds[c.id - 1] > 0 && <i>袋里有 {farm.seeds[c.id - 1]}</i>}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Barn({ catalog, farm, sell }: { catalog: Catalog; farm: FarmView; sell: (crop: number, count: number) => void }) {
  const stock = catalog.crops.filter((c) => farm.fruits[c.id - 1] > 0);
  const worth = stock.reduce((sum, c) => sum + c.sellPrice * farm.fruits[c.id - 1], 0);
  return (
    <>
      <h2>仓库</h2>
      {stock.length === 0 ? (
        <p className="drawer-note">仓库是空的。收获的果实会放在这里，卖掉换金币。</p>
      ) : (
        <>
          <ul className="list">
            {stock.map((c) => {
              const n = farm.fruits[c.id - 1];
              return (
                <li key={c.id} className="row static">
                  <CropIcon id={c.id} size={44} />
                  <span className="row-main">
                    <b>
                      {CROP_NAMES[c.id]} ×{num(n)}
                    </b>
                    <span>每个卖 {c.sellPrice}</span>
                  </span>
                  <button className="btn small" onClick={() => sell(c.id, n)}>
                    卖出 <Coin size={14} /> {num(n * c.sellPrice)}
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="btn big" onClick={() => stock.forEach((c) => sell(c.id, farm.fruits[c.id - 1]))}>
            全部卖出，共 {num(worth)} 金币
          </button>
        </>
      )}
    </>
  );
}

function Neighbours({ game, go }: { game: Game; go: (id: string) => void }) {
  const rows = useMemo(() => {
    return game.farms
      .filter((f) => f.id !== game.mine?.id)
      .map((f) => {
        const v = game.look(f, true);
        const grown = (v?.plots.filter((p) => p.crop) ?? []) as PlotView[];
        return {
          id: f.id,
          view: v,
          loot: grown.filter((p) => p.steal > 0).length,
          trouble: grown.filter((p) => !p.withered && p.problems.some(Boolean)).length,
        };
      })
      .filter((r) => r.view)
      .sort((a, b) => b.loot - a.loot || b.trouble - a.trouble || b.view!.exp - a.view!.exp);
  }, [game]);
  return (
    <>
      <h2>邻居</h2>
      <p className="drawer-note">这条链上每一座农场都是你的邻居，不需要加好友。</p>
      {rows.length === 0 ? (
        <p className="drawer-note">眼下只有你一户。换个账户再开一座，就能互相串门了。</p>
      ) : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id}>
              <button className={`row ${game.visited?.id === r.id ? "on" : ""}`} onClick={() => go(r.id)}>
                <span className="avatar">{r.view!.level}</span>
                <span className="row-main">
                  <b>{r.view!.name || "无名农场"}</b>
                  <span>
                    {r.view!.level} 级，{r.view!.land} 块地
                  </span>
                </span>
                <span className="row-side">
                  {r.loot > 0 && <i className="pill ripe">{r.loot} 块可摘</i>}
                  {r.trouble > 0 && <i className="pill">{r.trouble} 块要帮忙</i>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Rules({ catalog, game }: { catalog: Catalog; game: Game }) {
  const unit = game.chain!.unit;
  const d = game.chain!.deployment;
  return (
    <>
      <h2>规则</h2>
      <div className="prose">
        <p>这里没有服务器。农场是 CKB 上的一个格子，下面每一条都写在合约里，由全网节点验算，包括部署者在内没有人能改。</p>
        <ul>
          <li>这个世界里 1 个游戏小时是 {span(unit)}，一天 {catalog.hoursPerDay} 小时。</li>
          <li>播种的时刻取自打包那笔交易的区块，谁也没法谎报。</li>
          <li>作物会自己长草、生虫、缺水。到收获时每留一样没处理，就少收 {catalog.problemPenaltyPercent}%。</li>
          <li>熟了的作物，每个邻居每季每块地能摘一次，全部邻居合计最多摘走四成。</li>
          <li>帮邻居除草、除虫、浇水得 {catalog.expHelp} 点经验，每天前 {catalog.helpExpPerDay} 次有效。</li>
          <li>每天最多往别人地里放 {catalog.mischiefPerDay} 次草或虫。</li>
          <li>{catalog.dogLevel} 级起可以喂狗，花 {catalog.dogFoodPrice} 金币管一天，挡住约 {catalog.dogBlockPercent}% 的偷摘。</li>
          <li>串门不需要对方签名，也动不了规则以外的任何东西。</li>
        </ul>
        <p className="mono">
          合约代码哈希
          <code>{d.codeHash}</code>
          我的地址
          <code>{game.address}</code>
        </p>
        <p>
          农场格子里押着的 CKB 始终是你的。收回农场会销毁这座农场连同里面的金币、作物和等级，把 CKB 退回钱包，无法撤销。
        </p>
        <button
          className="btn small danger"
          disabled={!!game.busy}
          onClick={() => {
            if (confirm("收回农场？金币、作物和等级都会消失，只有 CKB 回到钱包。")) game.close();
          }}
        >
          收回农场，取回 CKB
        </button>
      </div>
    </>
  );
}

const icon = { fill: "none", stroke: "#22331f", strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const BarnIcon = () => (
  <svg viewBox="0 0 36 36" width={34} height={34} aria-hidden="true">
    <path d="M5 16l13-10 13 10v15H5z" {...icon} fill="#e2533f" />
    <path d="M13 31V20h10v11M13 20l10 11M23 20L13 31" {...icon} fill="#fffdf4" />
  </svg>
);
const FenceIcon = () => (
  <svg viewBox="0 0 36 36" width={34} height={34} aria-hidden="true">
    <path d="M6 31V12l4-5 4 5v19zM22 31V12l4-5 4 5v19z" {...icon} fill="#e8c38d" />
    <path d="M14 16h8M14 25h8M2 16h4M2 25h4M30 16h4M30 25h4" {...icon} />
  </svg>
);
const BookIcon = () => (
  <svg viewBox="0 0 36 36" width={34} height={34} aria-hidden="true">
    <path d="M18 9c-4-3-9-3-13-1v20c4-2 9-2 13 1 4-3 9-3 13-1V8c-4-2-9-2-13 1z" {...icon} fill="#fffdf4" />
    <path d="M18 9v20" {...icon} />
  </svg>
);
