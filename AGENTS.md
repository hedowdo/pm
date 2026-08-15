#Project Management MVP web app

## Business requirement

this project is building a project management app, key features:

- a user can sign in
- when signed in, the user sees a Kanban board representing their project
- the Kanban board has fixed columns that can be renamed
- the cards on the Kanban board can be moved with drag and drop
- there is an AI chat feature in a sidebar; the Ai is able to create, edit, move one or more cards.

## Limitations

- for the MVP, there will only be a user sign in (hardcoded to 'user' and 'password') but the database will support multiple users for future
- for the mvp there will only be 1 Kanban board per sign in user
- for the mvp, this will run locally (in a docket container)

## technical decisions

- nextJS frontend
- python FastAPI backend, including serving the static NextJS site at
- everything packed into a docker container
- use "uv" as the package manager for python in the docker container
- user OpenRouter for the AI calls. an OPENROUTER_API_KEY is in .env in the project root.
- use openai/gpt-oss-20b:free as the model
- use SQLLite Local database for the database, creating a new db if it doesn't exist
- Start and stop server scripts for mac, pc ,Linux in scripts/

## Starting point

A working MVP of the frontend has been built and is already in frontend. this is not yet designed for the docker setup. It is pure frontend only demo.

## color scheme

- accent yellow : #ecad0a - accent lines, highlights
- blue primary: #209dd7 - links, key sections
- purple secondary: #753991 - submit buttons, important actions
- dark navy: #032147 - main headings
- gray text: #888888 - supporting text, labels


## coding standards

- use latest versions of libraries and idiomatic approaches as of today
- keep it simple - NEVER over engineer, always simplify, no unnecessary defensive programming. No extra features - focus on simplicity.
- be concise. keep README minimal. IMPORTANT: no emojies ever
- when hitting issues, always identify root cause before trying to fix. do not guess. prove with evidence then fix root cause.

## working documentation

- all documents for planning and executing this project will be in the docs/directory.
please review the docs/plan.md document before proceeding.




