# Owner branding correction

Owner request in fork, 2026-10-08T13:58:34Z: apply name and slogan to website.

- Name: `kvart na kvadrat`
- Slogan: `vaš omiljeni susjed`
- Visible header updated only at the two branding lines in `frontend/src/features/zagreb/ZagrebHome.tsx`: `k²` mark, lowercase name, Zagreb locality label, slogan.
- `frontend/src/app/layout.tsx`: browser title, description, application name and Open Graph name/description updated.
- No repository/MOZAK registration rename, no public deployment, no continuation of the original session's design work.
- Header file contains the original session's uncommitted redesign. Do not commit/revert that broader diff as part of this naming-only task.
- Typecheck and production build passed. Preview on port 3101 was restarted and verified in Chromium at 320, 390 and 1440 pixels: correct visible name, slogan, browser title and description, no horizontal overflow. Evidence: verification.json and branding-*.png.
- Only standalone metadata and this evidence are committed by the branding fork. The two header text edits remain in the original session's in-progress redesign diff for its normal integration commit.
