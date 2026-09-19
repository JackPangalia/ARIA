"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

export interface NotesEditorProps {
  /** Sanitized HTML to load. Re-applied only when `resetToken` changes. */
  content: string;
  /** Bump to replace the editor's document from `content` (doc switch, regeneration, conflict resolution). */
  resetToken: number;
  onChange: (html: string) => void;
  placeholder: string;
  editable?: boolean;
  /** Focus the editor when it mounts. */
  autoFocus?: boolean;
  ariaLabel: string;
}

const HEADINGS = [1, 2, 3] as const;

function ToolbarButton(props: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
      className={`kivo-notes-tool ${props.active ? "is-active" : ""}`}
    >
      {props.children}
    </button>
  );
}

/**
 * The notes surface. Headings, emphasis, and lists only — the same subset the
 * server sanitizer keeps — so what you type is what gets stored. Keyboard
 * shortcuts stay scoped to the editor's own element; nothing here listens on
 * the window.
 */
export default function NotesEditor(props: NotesEditorProps) {
  const { content, resetToken, onChange, placeholder, editable = true } = props;
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    // Rendering on the client only avoids a hydration mismatch and lets the
    // page be code-split around the editor.
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable,
    autofocus: props.autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [...HEADINGS] },
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "kivo-notes-prose",
        "aria-label": props.ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current(instance.getHTML());
    },
  });

  const appliedResetRef = useRef(resetToken);
  useEffect(() => {
    if (!editor) return;
    if (appliedResetRef.current === resetToken) return;
    appliedResetRef.current = resetToken;
    if (editor.getHTML() === content) return;
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content, resetToken]);

  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  const marks = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (!instance) return null;
      return {
        bold: instance.isActive("bold"),
        italic: instance.isActive("italic"),
        bullet: instance.isActive("bulletList"),
        ordered: instance.isActive("orderedList"),
        h1: instance.isActive("heading", { level: 1 }),
        h2: instance.isActive("heading", { level: 2 }),
      };
    },
  });

  return (
    <div className={`kivo-notes-editor ${editable ? "" : "is-readonly"}`}>
      {editable && editor ? (
        <div className="kivo-notes-toolbar" role="toolbar" aria-label="Formatting">
          <ToolbarButton
            label="Heading"
            active={Boolean(marks?.h1)}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <span className="kivo-notes-tool-glyph">H1</span>
          </ToolbarButton>
          <ToolbarButton
            label="Subheading"
            active={Boolean(marks?.h2)}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <span className="kivo-notes-tool-glyph">H2</span>
          </ToolbarButton>
          <span className="kivo-notes-tool-divider" aria-hidden />
          <ToolbarButton
            label="Bold"
            active={Boolean(marks?.bold)}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <span className="kivo-notes-tool-glyph font-semibold">B</span>
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={Boolean(marks?.italic)}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <span className="kivo-notes-tool-glyph italic">I</span>
          </ToolbarButton>
          <span className="kivo-notes-tool-divider" aria-hidden />
          <ToolbarButton
            label="Bulleted list"
            active={Boolean(marks?.bullet)}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="3" cy="4" r="1.1" fill="currentColor" />
              <circle cx="3" cy="8" r="1.1" fill="currentColor" />
              <circle cx="3" cy="12" r="1.1" fill="currentColor" />
              <path d="M6.5 4h7M6.5 8h7M6.5 12h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={Boolean(marks?.ordered)}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <text x="1" y="5.6" fontSize="4.6" fill="currentColor" fontFamily="ui-sans-serif, system-ui">1</text>
              <text x="1" y="9.6" fontSize="4.6" fill="currentColor" fontFamily="ui-sans-serif, system-ui">2</text>
              <text x="1" y="13.6" fontSize="4.6" fill="currentColor" fontFamily="ui-sans-serif, system-ui">3</text>
              <path d="M6.5 4h7M6.5 8h7M6.5 12h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </ToolbarButton>
        </div>
      ) : null}
      <EditorContent editor={editor} className="kivo-notes-content" />
    </div>
  );
}
