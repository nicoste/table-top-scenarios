# @tt/theme

**Owns.** The look both screens share, as two stylesheets: `tokens.css`, every
colour, size and font as a custom property, and `base.css`, the rules the two
screens need word for word. Each shell imports both first and adds only what is
its own (D-386). The design gallery links the same two files, so it shows the
theme as it is rather than a copy of it.

**Must never know about.** Any component's markup, any domain noun, or which
screen is which. A rule that only one screen needs stays in that screen's shell.

**May depend on:** _nothing_. It is CSS only: no script imports it, and the
apps reach it with `@import`, not through a barrel.

Adding a dependency here requires a numbered decision (R-7). The public surface
is the two files in `exports`.
