import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "react";

type Props = {
  text: string;
  language: "markdown" | "plain";
  onChange: (text: string) => void;
  onSave: () => void;
};

const theme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "transparent", color: "inherit" },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "13px",
      lineHeight: "1.6",
    },
    ".cm-content": { padding: "16px 0" },
    ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "inherit", opacity: "0.5" },
    "&.cm-focused": { outline: "none" },
  },
  { dark: true },
);

/** A text editor (CodeMirror 6). Ctrl+S saves. Lazy-loaded with its view. */
export default function CodeView({ text, language, onChange, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latestText = useRef(text);
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };
  latestText.current = text;

  useEffect(() => {
    const created = new EditorView({
      parent: host.current ?? undefined,
      state: EditorState.create({
        doc: latestText.current,
        extensions: [
          theme,
          EditorView.lineWrapping,
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                handlers.current.onSave();
                return true;
              },
            },
          ]),
          ...(language === "markdown" ? [markdown()] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = created;
    return () => {
      created.destroy();
      view.current = null;
    };
  }, [language]);

  // Text changed from outside the editor (a reload, or another view): show it.
  useEffect(() => {
    const current = view.current;
    if (current && current.state.doc.toString() !== text) {
      current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: text } });
    }
  }, [text]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
