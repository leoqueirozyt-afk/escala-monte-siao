import { useEffect, useState, type KeyboardEvent } from "react";
import { Clock, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { toast } from "../ui/toast";
import { Input } from "../ui/input";
import { parseMMSS } from "../../lib/youtube-player";

interface Person {
  id: number;
  name: string;
}

interface NoteComposerProps {
  songId: number;
  grabCurrentTime: () => string | null;
  onCreated: () => void;
}

export function NoteComposer({ songId, grabCurrentTime, onCreated }: NoteComposerProps) {
  const [text, setText] = useState("");
  const [time, setTime] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Person[]>("/users")
      .then((list) => setPeople(list.map((p) => ({ id: Number(p.id), name: p.name }))))
      .catch(() => setPeople([]));
  }, []);

  const query = text.match(/(^|\s)@([^\s@\[]*)$/)?.[2] ?? null;
  const showList = query !== null && people !== null;
  const matches = showList
    ? people
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
    : [];

  const insertMention = (name: string) => {
    setText((t) => t.replace(/(^|\s)@([^\s@\[]*)$/, `$1@[${name}] `));
    setMentionIdx(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIdx((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIdx((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      insertMention(matches[mentionIdx].name);
    } else if (e.key === "Escape") {
      setText((t) => t.replace(/@$/, ""));
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    let seconds: number | null = null;
    if (time.trim()) {
      seconds = parseMMSS(time.trim());
      if (seconds === null) {
        toast("Minutagem inválida — use 02:15", "error");
        return;
      }
    }
    const ids: number[] = [];
    const re = /\@\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const found = people?.find((p) => p.name === m![1]);
      if (found && !ids.includes(found.id)) ids.push(found.id);
    }
    setBusy(true);
    try {
      await api.post(`/playlists/songs/${songId}/notes`, { body, mentions: ids, seconds });
      setText("");
      setTime("");
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar anotação", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative pt-1">
      <div className="flex items-center gap-1.5">
        <Input
          aria-label="Nova anotação"
          className="h-9 flex-1 rounded-lg"
          placeholder="Escreva com @menção…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMentionIdx(0);
          }}
          onKeyDown={onKeyDown}
        />
        <Input
          aria-label="Minutagem"
          className="h-9 w-16 rounded-lg px-2 text-center"
          placeholder="02:15"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <button
          type="button"
          aria-label="Usar minuto atual do vídeo"
          title="Usar minuto atual do vídeo"
          disabled={!grabCurrentTime()}
          onClick={() => setTime(grabCurrentTime() ?? "")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40"
        >
          <Clock size={15} />
        </button>
        <button
          type="button"
          aria-label="Adicionar anotação"
          disabled={!text.trim() || busy}
          onClick={submit}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          <Plus size={16} />
        </button>
      </div>
      {showList && matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Sugestões de menção"
          className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-md"
        >
          {matches.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === mentionIdx}
                onClick={() => insertMention(p.name)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                  i === mentionIdx ? "bg-muted" : ""
                }`}
              >
                @{p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
