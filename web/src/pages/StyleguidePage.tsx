import { ChevronDown, Moon, Plus, Search, Sun, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { setTheme, useTheme } from '@/lib/theme';

// The design system, live: tokens and components as the app renders them, in either theme.
// The written guide is design/README.md; keep the two in step.

const BRAND = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const SEMANTIC = [
  ['background', 'Page'],
  ['card', 'Raised surface'],
  ['popover', 'Floating surface'],
  ['sidebar', 'Sidebar'],
  ['muted', 'Quiet fill'],
  ['accent', 'Hover fill'],
  ['primary', 'Call to action'],
  ['foreground', 'Text'],
  ['muted-foreground', 'Secondary text'],
  ['border', 'Hairlines'],
  ['ring', 'Focus'],
  ['destructive', 'Danger'],
];
const TYPE = [
  ['Display', 'text-4xl font-bold tracking-tight', 'Folder and note titles'],
  ['Title', 'text-2xl font-semibold tracking-tight', 'Page headings'],
  ['Heading', 'text-lg font-semibold', 'Dialog titles, sections'],
  ['Body', 'text-sm', 'Everything else'],
  ['Label', 'text-xs font-semibold tracking-wide uppercase text-muted-foreground', 'Group labels'],
  ['Caption', 'text-xs text-muted-foreground', 'Metadata, hints'],
];
const ELEVATION = [
  ['shadow-xs', 'Inputs, outline buttons'],
  ['shadow-sm', 'Cards at rest'],
  ['shadow-md', 'Cards on hover'],
  ['shadow-lg', 'Menus, popovers'],
  ['shadow-xl', 'Dialogs'],
  ['shadow-cta', 'Primary button'],
];

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t py-8">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm">{note}</p>
      </div>
      {children}
    </section>
  );
}

export function StyleguidePage() {
  const resolved = useTheme((state) => state.resolved);
  return (
    <div className="bg-background min-h-svh">
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="flex flex-wrap items-center gap-4 pb-8">
          <img src="/logo.svg" alt="" className="size-12" />
          <div className="min-w-64 flex-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Linkr design system</h1>
            <p className="text-muted-foreground">
              Warm, calm surfaces; crisp depth; one brand colour, used with intent.
            </p>
          </div>
          <Button variant="outline" onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}>
            {resolved === 'dark' ? <Sun /> : <Moon />} {resolved === 'dark' ? 'Light' : 'Dark'} theme
          </Button>
        </header>

        <Section
          title="Brand"
          note="The oranges of the Linkr mark. 600 carries white text in light mode, 400 dark text in dark mode."
        >
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
            {BRAND.map((step) => (
              <div key={step} className="grid gap-1">
                <div
                  className="h-12 rounded-lg ring-1 ring-black/5"
                  style={{ background: `var(--color-brand-${step})` }}
                />
                <span className="text-muted-foreground text-xs">{step}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Colour roles" note="Components use roles, never raw colours, so both themes stay right.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {SEMANTIC.map(([name, use]) => (
              <div key={name} className="grid gap-1.5">
                <div className="h-14 rounded-lg border" style={{ background: `var(--${name})` }} />
                <span className="text-sm font-medium">{name}</span>
                <span className="text-muted-foreground -mt-1 text-xs">{use}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type" note="Geist throughout. Tight tracking on large sizes; one weight step per level.">
          <div className="grid gap-3">
            {TYPE.map(([name, classes, use]) => (
              <div key={name} className="grid items-baseline gap-1 sm:grid-cols-[8rem_1fr_14rem]">
                <span className="text-muted-foreground text-xs">{name}</span>
                <span className={classes}>Organise your ideas</span>
                <span className="text-muted-foreground text-xs">{use}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Elevation"
          note="Higher things cast longer shadows. In dark mode, higher surfaces are also lighter."
        >
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
            {ELEVATION.map(([name, use]) => (
              <div key={name} className={`bg-card grid h-24 content-end gap-0.5 rounded-xl p-3 ${name}`}>
                <span className="text-sm font-medium">{name}</span>
                <span className="text-muted-foreground text-xs">{use}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons" note="One primary action per view. Ghost for toolbars, outline for secondary actions.">
          <div className="flex flex-wrap items-center gap-2">
            <Button>
              <Plus /> New note
            </Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">
              <Trash2 /> Delete
            </Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs">Extra small</Button>
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" variant="ghost" aria-label="Search">
              <Search />
            </Button>
          </div>
        </Section>

        <Section
          title="Fields and controls"
          note="Fields rest on the page with a hairline; focus shows the brand ring."
        >
          <div className="grid max-w-md gap-3">
            <Input placeholder="Paste a link or type to search" />
            <Textarea placeholder="A short description" />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox defaultChecked /> Include session notes
            </label>
            <div className="flex flex-wrap gap-2">
              <Badge>Term 1</Badge>
              <Badge variant="secondary">Article</Badge>
              <Badge variant="outline">Can view</Badge>
              <Badge variant="destructive">Failed</Badge>
            </div>
            <Tabs defaultValue="notes">
              <TabsList>
                <TabsTrigger value="notes">Session notes</TabsTrigger>
                <TabsTrigger value="draft">My draft</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </Section>

        <Section title="Overlays" note="Menus float (shadow-lg); dialogs sit highest (shadow-xl) over a dimmed page.">
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Menu <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52">
                <DropdownMenuItem>Open</DropdownMenuItem>
                <DropdownMenuItem>Send to someone…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Move to trash</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share a public link</DialogTitle>
                  <DialogDescription>Anyone with the link can view this folder. No account needed.</DialogDescription>
                </DialogHeader>
                <Input readOnly value="https://linkr.example/p/abc123" />
                <DialogFooter>
                  <Button variant="outline">Turn off</Button>
                  <Button>Copy link</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </Section>
      </main>
    </div>
  );
}
