import { useEffect } from "react";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Bold, Braces, Heading2, Heading3, Italic, List, ListOrdered, Minus, Quote, Redo2, Underline, Undo2, type LucideIcon } from "lucide-react";
import { CONTRACT_VARIABLES } from "@shared/contract";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ToolButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolButton({ icon: Icon, label, active = false, disabled = false, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection: a toolbar click must not move focus out of the editor first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        active && "bg-accent text-foreground",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;

function Toolbar({ editor, variables }: { editor: Editor; variables: boolean }) {
  const chain = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 overflow-x-auto border-b bg-muted/40 px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ToolButton icon={Heading2} label="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon={Heading3} label="Sub-heading" active={editor.isActive("heading", { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Divider />
      <ToolButton icon={Bold} label="Bold" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()} />
      <ToolButton icon={Underline} label="Underline" active={editor.isActive("underline")} onClick={() => chain().toggleUnderline().run()} />
      <Divider />
      <ToolButton icon={List} label="Bullet list" active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="Numbered list" active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon={Quote} label="Quote" active={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton icon={Minus} label="Divider line" onClick={() => chain().setHorizontalRule().run()} />
      <Divider />
      <ToolButton icon={Undo2} label="Undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()} />
      <ToolButton icon={Redo2} label="Redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()} />
      {variables && (
        <>
          <Divider />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
                <Braces /> Insert field
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64"
              // Hand focus back to the text (not the menu button) so typing continues where the field was inserted.
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                editor.commands.focus();
              }}
            >
              <DropdownMenuLabel>Filled in automatically for each contract</DropdownMenuLabel>
              {CONTRACT_VARIABLES.map((variable) => (
                <DropdownMenuItem key={variable.key} onSelect={() => editor.chain().insertContent(`{${variable.key}}`).run()}>
                  <span className="flex-1">{variable.label}</span>
                  <code className="text-[11px] text-muted-foreground">{`{${variable.key}}`}</code>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}

interface RichEditorProps {
  /** Starting HTML. The editor owns the text afterwards; remount (change `key`) to load a different document. */
  initialContent: string;
  onChange: (html: string) => void;
  /** Show the "Insert field" menu (templates). */
  variables?: boolean;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}

/** Rich-text editor for agreements: headings, emphasis, lists, quotes and rules – nothing that can't be printed faithfully. */
export function RichEditor({ initialContent, onChange, variables = false, placeholder = "Write the agreement here…", ariaLabel, className }: RichEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: false, code: false, codeBlock: false, strike: false }), Placeholder.configure({ placeholder })],
    content: initialContent,
    // Toolbar buttons reflect the current selection, so re-render as it moves.
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: "contract-prose", role: "textbox", "aria-multiline": "true", "aria-label": ariaLabel } },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  });

  useEffect(() => () => editor.destroy(), [editor]);

  return (
    <div className={cn("contract-editor overflow-hidden rounded-xl border bg-card shadow-soft transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25", className)}>
      <Toolbar editor={editor} variables={variables} />
      <EditorContent editor={editor} />
    </div>
  );
}
