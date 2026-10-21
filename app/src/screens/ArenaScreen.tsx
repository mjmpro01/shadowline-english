import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { Loading } from '../components/LoadState'
import { useApp } from '../store/context'
import { gameApi, type Battle, type GameState, type HarvestedWord, type Quests, type Reward, type Turn } from '../game/api'
import { art, artManifest, type ArtManifest } from '../game/assets'
import { GameBus, type MapName, type NpcId, type Target } from '../game/bus'
import { idleLine } from '../game/npcs'
import { BattlePanel } from '../game/ui/BattlePanel'
import { Dialogue } from '../game/ui/Dialogue'
import { ActionButton, Hud, Joystick, Tracker } from '../game/ui/Hud'
import { BagPanel, BramPanel, HousePanel, PlotPanel, ShopPanel, WordCard } from '../game/ui/panels'
import { QuestBook } from '../game/ui/QuestBook'
import { RewardChips } from '../game/ui/common'
import { gameError } from '../game/ui/util'
import '../styles/arena.css'

type Panel =
  | { kind: 'plot'; idx: number }
  | { kind: 'talk'; who: NpcId | 'grandma' }
  | { kind: 'shop' }
  | { kind: 'bram' }
  | { kind: 'house' }
  | { kind: 'bag' }
  | { kind: 'quests'; tab: 'main' | 'daily' }
  | { kind: 'word'; word: HarvestedWord | null; gold: number }
  | { kind: 'battle'; battle: Battle; turn: Turn | null }

type Game = { destroy: (removeCanvas: boolean) => void }

/**
 * The Arena: a farm where every harvest is a word.
 *
 * Phaser draws the farm and walks the player around it; this screen holds the
 * farm the server sent, opens the panels, and makes the moves. The engine is
 * imported only once this screen mounts, so no other screen downloads it.
 */
export function ArenaScreen() {
  const { t, locale } = useI18n()
  const { refreshVocab } = useApp()
  const bus = useMemo(() => new GameBus(), [])
  const holder = useRef<HTMLDivElement>(null)
  /** The engine, once it is starting: kept as a promise so a screen left
   *  before it finished starting still stops it. */
  const game = useRef<Promise<Game> | null>(null)

  const [state, setState] = useState<GameState | null>(null)
  const [quests, setQuests] = useState<Quests | null>(null)
  const [skew, setSkew] = useState(0)
  const [failed, setFailed] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [focus, setFocus] = useState<Target | null>(null)
  /** The scene is drawn and taking keys. */
  const [ready, setReady] = useState(false)
  /** The map on screen, once it is drawn. */
  const [map, setMap] = useState<MapName | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string; reward?: Reward } | null>(null)
  /** How the art's strips are cut, for the monster in the fight panel. */
  const [artInfo, setArtInfo] = useState<ArtManifest | null>(null)
  useEffect(() => {
    void artManifest().then(setArtInfo)
  }, [])

  const take = useCallback((next: GameState) => {
    setState(next)
    setSkew(Date.parse(next.now) - Date.now())
  }, [])

  const refreshQuests = useCallback(async () => {
    try {
      setQuests(await gameApi.quests())
    } catch {
      /* the next move refreshes them again */
    }
  }, [])

  // Load the farm, then start the engine on the spot the player left.
  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [s, q, b] = await Promise.all([gameApi.state(), gameApi.quests(), gameApi.battle()])
      take(s)
      setQuests(q)
      // A fight left half-way goes on where it was; a new farmer's first
      // sight is Grandma's letter.
      if (b.battle) setPanel({ kind: 'battle', battle: b.battle, turn: null })
      else if (q.main?.id === 'letter') setPanel({ kind: 'talk', who: 'grandma' })
      const parent = holder.current
      if (parent && !game.current) {
        const start = s.profile.x || s.profile.y ? { x: s.profile.x, y: s.profile.y } : null
        const map = s.profile.map === 'woods' && s.profile.woodsOpen ? 'woods' : 'farm'
        game.current = import('../game/createGame').then(({ createGame }) => createGame(parent, bus, start, map))
        await game.current
      }
    } catch {
      setFailed(true)
    }
  }, [bus, take])

  useEffect(() => {
    // Every setState inside load() runs after an await.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
    return () => {
      void game.current?.then((g) => g.destroy(true))
      game.current = null
    }
  }, [load])

  // The scene draws whatever the server last said.
  useEffect(() => {
    if (state) bus.emit('state', state)
  }, [bus, state])
  useEffect(() => {
    bus.emit('questGiver', { giver: quests?.main?.giver ?? null, done: quests?.main?.done ?? false })
  }, [bus, quests])
  useEffect(() => {
    bus.setPaused(panel !== null)
  }, [bus, panel])

  // What the scene says back.
  /** Where the scene is sent once it is up, when it was sent before. */
  const pendingGoto = useRef<{ map: MapName; x: number; y: number } | null>(null)
  const questsRef = useRef(quests)
  useEffect(() => {
    questsRef.current = quests
  }, [quests])
  useEffect(() => {
    const offs = [
      bus.on('focus', setFocus),
      bus.on('ready', (drawn) => {
        setReady(true)
        setMap(drawn)
        const to = pendingGoto.current
        pendingGoto.current = null
        if (to) bus.emit('goto', to)
      }),
      bus.on('moved', ({ map, x, y }) => void gameApi.move(map, x, y).catch(() => {})),
      bus.on('blocked', () => setToast({ text: t('arena.woods.locked') })),
      bus.on('interact', (target) => {
        switch (target.kind) {
          case 'plot':
            setPanel({ kind: 'plot', idx: target.idx })
            break
          case 'npc':
            setPanel({ kind: 'talk', who: target.id })
            break
          case 'house':
            setPanel({ kind: 'house' })
            break
          case 'mailbox':
            if (questsRef.current?.main?.giver === 'grandma') setPanel({ kind: 'talk', who: 'grandma' })
            else setToast({ text: t('arena.mail.none') })
            break
          case 'board':
            setPanel({ kind: 'quests', tab: 'daily' })
            break
          case 'lair':
            setToast({ text: t('arena.woods.lair') })
            break
        }
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [bus, t])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(id)
  }, [toast])

  /** Makes one move: the answer replaces the farm, the quests follow. True
   *  when the server took it. */
  const move = useCallback(
    async (fn: () => Promise<GameState>): Promise<boolean> => {
      setBusy(true)
      try {
        take(await fn())
        void refreshQuests()
        return true
      } catch (err) {
        setToast({ text: gameError(err, t) })
        return false
      } finally {
        setBusy(false)
      }
    },
    [refreshQuests, t, take],
  )

  // The word card waits for the player to finish picking the crop.
  const cardTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(cardTimer.current), [])

  const plant = async (idx: number, seed: string) => {
    if (await move(() => gameApi.plant(idx, seed))) {
      setPanel(null)
      bus.emit('planted', idx)
    }
  }

  const sleep = async () => {
    const slept = await move(() => gameApi.sleep())
    setPanel(null)
    if (slept) bus.emit('slept', undefined)
  }

  const harvest = async (idx: number) => {
    setBusy(true)
    try {
      const res = await gameApi.harvest(idx)
      take(res.state)
      setPanel(null)
      bus.emit('harvested', idx)
      cardTimer.current = window.setTimeout(() => setPanel({ kind: 'word', word: res.word, gold: res.gold }), 600)
      void refreshQuests()
      if (res.word) void refreshVocab()
    } catch (err) {
      setToast({ text: gameError(err, t) })
    } finally {
      setBusy(false)
    }
  }

  const claim = async (quest: string) => {
    setBusy(true)
    try {
      const res = await gameApi.claim(quest)
      take(res.state)
      setQuests(res.quests)
      setToast({ text: t('arena.got'), reward: res.reward })
      if (quest === 'main') setPanel(null)
    } catch (err) {
      setToast({ text: gameError(err, t) })
    } finally {
      setBusy(false)
    }
  }

  /** Walks into a fight with the monster at this spot. */
  const starting = useRef(false)
  const fight = useCallback(
    async (spawn: string) => {
      if (starting.current) return
      starting.current = true
      setBusy(true)
      try {
        const res = await gameApi.startBattle(spawn)
        take(res.state)
        setPanel({ kind: 'battle', battle: res.battle, turn: null })
      } catch (err) {
        setToast({ text: gameError(err, t) })
      } finally {
        starting.current = false
        setBusy(false)
      }
    },
    [t, take],
  )
  useEffect(() => bus.on('interact', (target) => target.kind === 'monster' && void fight(target.spawn)), [bus, fight])

  const answer = async (battle: Battle, said: string) => {
    setBusy(true)
    try {
      const res = await gameApi.answer(battle.id, said)
      take(res.state)
      setPanel({ kind: 'battle', battle: res.battle, turn: res.turn })
      void refreshQuests()
    } catch (err) {
      setToast({ text: gameError(err, t) })
      // The fight may have ended elsewhere; show it as the server has it.
      const now = await gameApi.battle().catch(() => null)
      if (now && !now.battle) setPanel(null)
    } finally {
      setBusy(false)
    }
  }

  const flee = async (battle: Battle) => {
    setBusy(true)
    try {
      const res = await gameApi.flee(battle.id)
      take(res.state)
      setPanel({ kind: 'battle', battle: res.battle, turn: null })
    } catch (err) {
      setToast({ text: gameError(err, t) })
    } finally {
      setBusy(false)
    }
  }

  /** After the fight: the words just practised are in Vocabulary, and a
   *  farmer who fainted wakes at home. */
  const leaveBattle = (battle: Battle) => {
    setPanel(null)
    void refreshQuests()
    if (battle.words.length > 0) void refreshVocab()
    if (battle.state === 'lost' && state) {
      // A fight reopened on loading can end before the scene is drawn.
      const home = { map: 'farm' as const, x: state.profile.x, y: state.profile.y }
      if (ready) bus.emit('goto', home)
      else pendingGoto.current = home
    }
  }

  const close = useCallback(() => setPanel(null), [])
  const common = state ? { state, locale, t, onClose: close, busy, skew } : null

  const talk = (who: NpcId | 'grandma') => {
    const main = quests?.main ?? null
    const quest = main && main.giver === who ? main : null
    const lines = quest ? quest.lines : [idleLine(who)]
    const actions =
      who === 'mira' ? (
        <button type="button" className="btn btn-secondary" onClick={() => setPanel({ kind: 'shop' })}>
          {t('arena.shopOpen')}
        </button>
      ) : who === 'bram' ? (
        <button type="button" className="btn btn-secondary" onClick={() => setPanel({ kind: 'bram' })}>
          {t('arena.bramOpen')}
        </button>
      ) : null
    return (
      <Dialogue
        speaker={who}
        lines={lines}
        quest={quest}
        state={state}
        locale={locale}
        t={t}
        busy={busy}
        onClose={close}
        onClaim={() => void claim('main')}
        actions={actions}
      />
    )
  }

  return (
    <div
      className="arena"
      data-testid="arena"
      data-ready={ready}
      data-map={map ?? undefined}
      style={
        {
          '--arena-panel': `url(${art('ui/panel.png')})`,
          '--arena-dialog': `url(${art('ui/dialog_box.png')})`,
        } as CSSProperties
      }
    >
      <div ref={holder} className="arena-canvas" />

      {failed && (
        <div className="arena-cover">
          <p>{t('arena.loadFailed')}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            {t('arena.retry')}
          </button>
        </div>
      )}
      {!state && !failed && (
        <div className="arena-cover">
          <Loading label={t('arena.loading')} />
        </div>
      )}

      {state && (
        <>
          <Hud
            state={state}
            quests={quests}
            t={t}
            skew={skew}
            onQuests={() => setPanel({ kind: 'quests', tab: 'main' })}
            onBag={() => setPanel({ kind: 'bag' })}
          />
          <Tracker quests={quests} locale={locale} onOpen={() => setPanel({ kind: 'quests', tab: 'main' })} />
          {!panel && <ActionButton focus={focus} bus={bus} t={t} />}
          {!panel && <Joystick bus={bus} />}
          <p className="arena-controls">{t('arena.controls')}</p>
        </>
      )}

      {toast && (
        <div className="arena-toast" role="status">
          <span>{toast.text}</span>
          {toast.reward && <RewardChips reward={toast.reward} state={state} locale={locale} t={t} />}
        </div>
      )}

      {common && panel?.kind === 'plot' && (
        <PlotPanel
          {...common}
          idx={panel.idx}
          onPlant={(seed) => void plant(panel.idx, seed)}
          onHarvest={() => void harvest(panel.idx)}
        />
      )}
      {common && panel?.kind === 'shop' && (
        <ShopPanel {...common} onBuy={(item) => void move(() => gameApi.buy(item, 1))} />
      )}
      {common && panel?.kind === 'bram' && (
        <BramPanel
          {...common}
          onUnlock={(idx) => void move(() => gameApi.unlock(idx))}
          onUpgrade={(idx) => void move(() => gameApi.upgrade(idx))}
        />
      )}
      {common && panel?.kind === 'house' && (
        <HousePanel {...common} onSleep={() => void sleep()} />
      )}
      {common && panel?.kind === 'bag' && (
        <BagPanel {...common} onUse={(item) => void move(() => gameApi.use(item))} />
      )}
      {panel?.kind === 'word' && (
        <WordCard
          word={panel.word}
          gold={panel.gold}
          t={t}
          onClose={close}
          onListen={(word) => void gameApi.listen(word).then(refreshQuests, () => {})}
        />
      )}
      {panel?.kind === 'talk' && talk(panel.who)}
      {panel?.kind === 'battle' && (
        <BattlePanel
          battle={panel.battle}
          turn={panel.turn}
          state={state}
          locale={locale}
          t={t}
          busy={busy}
          skew={skew}
          onAnswer={(said) => void answer(panel.battle, said)}
          onNext={() => setPanel({ kind: 'battle', battle: panel.battle, turn: null })}
          onFlee={() => void flee(panel.battle)}
          onClose={() => leaveBattle(panel.battle)}
          artInfo={artInfo}
        />
      )}
      {quests && panel?.kind === 'quests' && (
        <QuestBook
          quests={quests}
          state={state}
          locale={locale}
          t={t}
          busy={busy}
          skew={skew}
          start={panel.tab}
          onClose={close}
          onClaim={(q) => void claim(q)}
        />
      )}
    </div>
  )
}
