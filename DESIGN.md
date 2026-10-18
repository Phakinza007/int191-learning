# INT191 Database Lab design

## Direction

A focused study desk: students move between short explanations and hands-on database tools. The interface uses a clean white reading surface, blue gray workspace and deep ocean blue for the current task. Burnt orange marks the primary learning action. Dark mode supports evening study. Color strategy: restrained app shell with one committed blue resume panel.

## Colors

Use theme.css semantic tokens, expressed in OKLCH. Ocean is the default. Forest and Graphite remain available as alternate accent palettes. PK/info, FK/success, hint and error keep distinct semantic roles across all accents. Always retain textual PK/FK badges.

## Typography

Local LINE Seed Sans TH for Thai and English UI. Monospace for schemas, column names and SQL. Heading sizes use fixed rem values; body text stays at comfortable line height and under 75 characters per line.

## Layout

Dark brand bar, compact introductory heading, section tabs, a curriculum rail and a spacious learning surface. Desktop rail is sticky. Mobile collapses the curriculum behind an explicit toggle, with all topics still directly reachable. The dashboard has one resume panel, a working relationship preview, lab shortcuts, review and bookmarks, then an ordered curriculum.

## Components

Ten to sixteen pixel corners, full borders, consistent 44px controls, visible focus. Navigation uses quiet rows and active fill. Lessons use dividers and whitespace; cards are reserved for interactive workspaces and distinct decisions. Tables use compact headers and clear PK/FK labels. Normalization steps and lab tabs have a consistent selected state.

## Motion

Short color and border transitions for interaction feedback; no entry choreography. Reduced-motion mode disables transitions and animation.
