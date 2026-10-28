import { useEffect, useMemo, useState } from 'react';

import { supabase } from './supabase';

type Thread = {
  id: string;
  last_message_at: string;
  is_group: boolean;
  shop_id: string | null;
  shop_name: string | null;
  buyer_label: string | null;
  buyer_handle: string | null;
  partner_label: string | null;
  partner_handle: string | null;
  message_count: number;
  unanswered: boolean;
  preview: string | null;
};

type Message = {
  id: string;
  created_at: string;
  sender_label: string | null;
  sender_handle: string | null;
  body: string;
  via: string;
  listing_label: string | null;
  deal_status: string | null;
};

type Inquiry = {
  id: string;
  created_at: string;
  status: string;
  message: string | null;
  buyer_label: string | null;
  buyer_handle: string | null;
  shop_name: string | null;
  listing_label: string | null;
  conversation_id: string | null;
  unanswered: boolean;
};

export type InboxFocus = { dealerId: string; dealerName: string };

export function Inbox({
  focus,
  onClearFocus,
}: {
  focus: InboxFocus | null;
  onClearFocus: () => void;
}) {
  const [mode, setMode] = useState<'threads' | 'inquiries'>('threads');
  const [unansweredOnly, setUnansweredOnly] = useState(true);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [opened, setOpened] = useState<{
    dealerId: string | null;
    unansweredOnly: boolean;
    id: string;
  } | null>(null);
  const [loadedMessages, setLoadedMessages] = useState<{ id: string; rows: Message[] } | null>(null);
  const [fetchedMeta, setFetchedMeta] = useState<{ id: string; thread: Thread | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dealerId = focus?.dealerId ?? null;
  const openId =
    opened && opened.dealerId === dealerId && opened.unansweredOnly === unansweredOnly ? opened.id : null;
  const messages = openId && loadedMessages?.id === openId ? loadedMessages.rows : null;

  useEffect(() => {
    let live = true;
    void (async () => {
      setError(null);
      if (mode === 'threads') {
        const { data, error: failed } = await supabase.rpc('operator_conversations', {
          p_dealer_id: dealerId ?? undefined,
          p_unanswered_only: unansweredOnly,
          p_limit: 80,
        });
        if (!live) return;
        setError(failed?.message ?? null);
        setThreads((data as Thread[]) ?? []);
        setInquiries(null);
      } else {
        const { data, error: failed } = await supabase.rpc('operator_inquiries', {
          p_dealer_id: dealerId ?? undefined,
          p_unanswered_only: unansweredOnly,
          p_limit: 80,
        });
        if (!live) return;
        setError(failed?.message ?? null);
        setInquiries((data as Inquiry[]) ?? []);
      }
    })();
    return () => {
      live = false;
    };
  }, [mode, unansweredOnly, dealerId]);

  useEffect(() => {
    if (!openId) return;
    let live = true;
    void supabase.rpc('operator_conversation_messages', { p_conversation_id: openId }).then(({ data, error: failed }) => {
      if (!live) return;
      setError(failed?.message ?? null);
      setLoadedMessages({ id: openId, rows: (data as Message[]) ?? [] });
    });
    return () => {
      live = false;
    };
  }, [openId]);

  const selectedThread = useMemo(
    () => (openId && threads ? threads.find((thread) => thread.id === openId) ?? null : null),
    [openId, threads],
  );

  const threadMeta =
    openId && !selectedThread && fetchedMeta?.id === openId ? fetchedMeta.thread : null;
  const activeThread = selectedThread ?? threadMeta;

  useEffect(() => {
    if (!openId || selectedThread) return;
    let live = true;
    void supabase
      .rpc('operator_conversations', {
        p_dealer_id: dealerId ?? undefined,
        p_unanswered_only: false,
        p_limit: 80,
      })
      .then(({ data }) => {
        if (!live) return;
        const found = ((data as Thread[]) ?? []).find((thread) => thread.id === openId) ?? null;
        setFetchedMeta({ id: openId, thread: found });
      });
    return () => {
      live = false;
    };
  }, [openId, selectedThread, dealerId]);

  function openThread(id: string) {
    setMode('threads');
    setOpened({ dealerId, unansweredOnly, id });
  }

  const loading = mode === 'threads' ? threads === null : inquiries === null;

  return (
    <section className="inbox">
      <header className="toolbar">
        <h1>Messages</h1>
        {focus ? (
          <span className="inbox-focus-chip">
            <span className="muted small">{focus.dealerName}</span>
            <button className="ghost compact" type="button" onClick={onClearFocus}>
              All shops
            </button>
          </span>
        ) : null}
        <label className="inbox-filter">
          <input
            type="checkbox"
            checked={unansweredOnly}
            onChange={(event) => setUnansweredOnly(event.target.checked)}
          />
          Waiting 48h+
        </label>
      </header>

      <p className="muted small inbox-note">Read-only — same threads buyers and dealers see in the app.</p>

      {error ? <p className="error">{error}</p> : null}

      <div className="inbox-split">
        <aside className="inbox-rail" aria-label="Conversations">
          <div className="inbox-rail-head">
            <div className="tabs inbox-mode-tabs">
              <button className={mode === 'threads' ? 'tab on' : 'tab'} type="button" onClick={() => setMode('threads')}>
                Threads
              </button>
              <button
                className={mode === 'inquiries' ? 'tab on' : 'tab'}
                type="button"
                onClick={() => setMode('inquiries')}>
                Inquiries
              </button>
            </div>
          </div>

          <div className="inbox-rail-list">
            {loading ? <p className="muted inbox-rail-empty">Loading…</p> : null}

            {mode === 'threads' && threads ? (
              threads.length === 0 ? (
                <p className="muted inbox-rail-empty">No threads match.</p>
              ) : (
                <ul className="inbox-conv-list">
                  {threads.map((thread) => (
                    <li key={thread.id}>
                      <button
                        type="button"
                        className={openId === thread.id ? 'inbox-conv on' : 'inbox-conv'}
                        onClick={() => openThread(thread.id)}>
                        <PersonAvatar label={threadTitle(thread)} />
                        <span className="inbox-conv-copy">
                          <span className="inbox-conv-line">
                            <strong className="inbox-conv-name">{threadTitle(thread)}</strong>
                            <span className="inbox-conv-when">{formatRelative(thread.last_message_at)}</span>
                          </span>
                          <span className="inbox-conv-line">
                            <span className="inbox-conv-preview">{thread.preview || 'No messages yet'}</span>
                            {thread.unanswered ? <span className="inbox-unread-dot" title="Waiting for a reply" /> : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {mode === 'inquiries' && inquiries ? (
              inquiries.length === 0 ? (
                <p className="muted inbox-rail-empty">No inquiries match.</p>
              ) : (
                <ul className="inbox-conv-list">
                  {inquiries.map((row) => (
                    <li key={row.id}>
                      <div className="inbox-conv static">
                        <PersonAvatar label={personLabel(row.buyer_label, row.buyer_handle)} />
                        <span className="inbox-conv-copy">
                          <span className="inbox-conv-line">
                            <strong className="inbox-conv-name">
                              {personLabel(row.buyer_label, row.buyer_handle)}
                            </strong>
                            <span className="inbox-conv-when">{formatRelative(row.created_at)}</span>
                          </span>
                          <span className="muted small oneline">
                            {row.listing_label ?? 'Watch'} · {row.shop_name ?? 'shop'}
                          </span>
                          {row.message ? (
                            <span className="inbox-conv-preview">{row.message}</span>
                          ) : (
                            <span className="inbox-conv-preview muted">No message text</span>
                          )}
                          <span className="inbox-conv-meta">
                            {row.unanswered ? <span className="badge bad">waiting</span> : null}
                            <span className="badge">{row.status}</span>
                            {row.conversation_id ? (
                              <button
                                type="button"
                                className="ghost compact inbox-open-thread"
                                onClick={() => openThread(row.conversation_id!)}>
                                View thread
                              </button>
                            ) : null}
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </aside>

        <div className="inbox-pane">
          {!openId ? (
            <div className="inbox-pane-empty">
              <p className="muted">Select a thread to read the conversation.</p>
            </div>
          ) : (
            <>
              <header className="inbox-pane-head">
                <div>
                  <h2 className="inbox-pane-title">{activeThread ? threadTitle(activeThread) : 'Thread'}</h2>
                  {activeThread ? (
                    <p className="muted small inbox-pane-sub">
                      {activeThread.message_count} message{activeThread.message_count === 1 ? '' : 's'}
                      {activeThread.shop_name ? ` · ${activeThread.shop_name}` : ''}
                      {activeThread.unanswered ? ' · waiting on a reply' : ''}
                      {activeThread.shop_name && !activeThread.is_group ? (
                        <span className="inbox-legend">
                          · <span className="legend-buyer">Buyer</span> left ·{' '}
                          <span className="legend-shop">Shop</span> right
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </header>

              <div className="inbox-chat">
                {messages === null ? (
                  <p className="muted inbox-pane-empty">Loading messages…</p>
                ) : messages.length === 0 ? (
                  <p className="muted inbox-pane-empty">This thread has no messages.</p>
                ) : (
                  <ul className="chat-thread">
                    {messages.map((message, index) => {
                      const side = messageSide(message, activeThread);
                      return (
                        <li key={message.id} className={`chat-run chat-run--${side}`}>
                          <ChatBubble
                            message={message}
                            side={side}
                            showSpeaker={startOfRun(messages, index)}
                            showWhen={endOfRun(messages, index)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

type MessageSide = 'buyer' | 'shop';

function ChatBubble({
  message,
  side,
  showSpeaker,
  showWhen,
}: {
  message: Message;
  side: MessageSide;
  showSpeaker: boolean;
  showWhen: boolean;
}) {
  const name = personLabel(message.sender_label, message.sender_handle);
  const role = side === 'buyer' ? 'Buyer' : 'Shop';
  return (
    <div className={`chat-bubble-wrap chat-bubble-wrap--${side}`}>
      {showSpeaker ? (
        <span className="chat-speaker">
          {name}
          <span className="chat-role">{role}</span>
        </span>
      ) : null}
      {message.listing_label ? (
        <div className={`chat-listing-quote chat-listing-quote--${side}`}>
          <span className="chat-listing-label">About</span>
          <strong className="oneline">{message.listing_label}</strong>
        </div>
      ) : null}
      <div className={`chat-bubble chat-bubble--${side}`}>
        {message.via === 'email' ? <span className="chat-caption">Sent by email</span> : null}
        {message.deal_status ? <span className="chat-caption">Deal · {message.deal_status}</span> : null}
        <p className="chat-body">{message.body}</p>
      </div>
      {showWhen ? (
        <time className="chat-when" dateTime={message.created_at}>
          {formatRelative(message.created_at)}
        </time>
      ) : null}
    </div>
  );
}

function messageSide(message: Message, thread: Thread | null): MessageSide {
  if (!thread || thread.is_group) {
    return 'buyer';
  }
  if (isBuyerSender(message, thread)) return 'buyer';
  return 'shop';
}

function isBuyerSender(message: Message, thread: Thread): boolean {
  const senderHandle = normHandle(message.sender_handle);
  const buyerHandle = normHandle(thread.buyer_handle);
  if (senderHandle && buyerHandle && senderHandle === buyerHandle) return true;

  const senderLabel = normLabel(message.sender_label);
  const buyerLabel = normLabel(thread.buyer_label);
  if (senderLabel && buyerLabel && senderLabel === buyerLabel) return true;

  return false;
}

function normHandle(handle: string | null): string | null {
  if (!handle) return null;
  return handle.replace(/^@/, '').trim().toLowerCase();
}

function normLabel(label: string | null): string | null {
  if (!label) return null;
  return label.trim().toLowerCase();
}

function PersonAvatar({ label }: { label: string }) {
  const initial = avatarInitial(label);
  return (
    <span className="person-avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

function avatarInitial(label: string): string {
  const trimmed = label.replace(/^@/, '').trim();
  const letter = trimmed[0]?.toUpperCase();
  return letter && /[A-Z0-9]/i.test(letter) ? letter : '?';
}

function threadTitle(thread: Thread): string {
  if (thread.is_group) return 'Group chat';
  if (thread.shop_name) {
    return `${personLabel(thread.buyer_label, thread.buyer_handle)} · ${thread.shop_name}`;
  }
  return `${personLabel(thread.buyer_label, thread.buyer_handle)} · ${personLabel(thread.partner_label, thread.partner_handle)}`;
}

function personLabel(name: string | null, handle: string | null): string {
  if (handle) return `@${handle}`;
  if (name) return name;
  return 'Unknown';
}

function sameSpeaker(a: Message, b: Message): boolean {
  return a.sender_handle === b.sender_handle && a.sender_label === b.sender_label;
}

function startOfRun(messages: Message[], index: number): boolean {
  return index === 0 || !sameSpeaker(messages[index], messages[index - 1]!);
}

function endOfRun(messages: Message[], index: number): boolean {
  return index === messages.length - 1 || !sameSpeaker(messages[index], messages[index + 1]!);
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Math.max(0, Date.now() - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return 'Just now';
  if (delta < hour) return `${Math.floor(delta / minute)}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  if (delta < 7 * day) return `${Math.floor(delta / day)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
