# Changelog

All notable changes to RoyalForms are documented here.


## [0.4.0](https://github.com/AfricanBongo/royalforms/compare/v0.3.0...v0.4.0) (2026-03-09)


### Features

* **db:** add field description column and template draft status ([9c2e5f7](https://github.com/AfricanBongo/royalforms/commit/9c2e5f70f46c9a502c8c66d53e18adc6ec90e3e5))
* **forms:** add draft save/update/publish and field description to service layer ([1425009](https://github.com/AfricanBongo/royalforms/commit/142500907516f6ee2513aac4152d8e91e7b4c346))
* **forms:** add field description and auto-abbreviation to builder hook ([7ed4e9a](https://github.com/AfricanBongo/royalforms/commit/7ed4e9a40367e6381c3cf4fd4eb5f6a4ffa62a29))
* **forms:** add field subtitle, type previews, and validation limits to builder ([3a997c5](https://github.com/AfricanBongo/royalforms/commit/3a997c53f46e4a62cd416d746a3e7a2fbdbd9df3))
* **forms:** add save draft flow, smart blocker, and draft badge in list ([de6b6f8](https://github.com/AfricanBongo/royalforms/commit/de6b6f86b4c8b32bc7497e910ea8daa7caff7e0d))


### Documentation

* **todo:** check off form builder improvements ([a94d34e](https://github.com/AfricanBongo/royalforms/commit/a94d34ef4488b79e55dbb37805b087d0429291c3))

## [0.3.0](https://github.com/AfricanBongo/royalforms/compare/v0.2.1...v0.3.0) (2026-03-09)


### Features

* **db:** add form instances tables, triggers, cron job, and Edge Function ([0a2b950](https://github.com/AfricanBongo/royalforms/commit/0a2b950a9d7f59e672265eab7ca62d763751f9aa))
* **forms:** add form builder with field type picker and edit support ([5b445ea](https://github.com/AfricanBongo/royalforms/commit/5b445eaa93a2199389be9e751268a9875d568d90))
* **forms:** add header action buttons and navigation blocker to builder ([7ae511b](https://github.com/AfricanBongo/royalforms/commit/7ae511b6f2e3499af033ad2e2a33dcfbfe05273e))
* **forms:** add share form sheet with group access management ([3812a9c](https://github.com/AfricanBongo/royalforms/commit/3812a9c998a5cfdfca233e17fc7f038b2eb86678))
* **forms:** add templates list and detail pages with stats view ([4ea6733](https://github.com/AfricanBongo/royalforms/commit/4ea6733862a722a7617bfaf6866767ace55df0a3))
* **layout:** add header actions support to page title context ([d9e9fdf](https://github.com/AfricanBongo/royalforms/commit/d9e9fdf3fa627a0d9ce17545bfe1ceed9938912d))


### Bug Fixes

* **forms:** add section delete with confirmation and fix field picker width ([4883fef](https://github.com/AfricanBongo/royalforms/commit/4883fefc9f6d40070768690ae59f5d68486b8752))


### Documentation

* replace scaffold README with project documentation ([ee43143](https://github.com/AfricanBongo/royalforms/commit/ee43143fc81446fe5244a75891fb81ccb68d1ad8))
* **todo:** update form builder checklist with new items ([aac7768](https://github.com/AfricanBongo/royalforms/commit/aac77684ddcf6804f7c868201cc601aa7a920a7a))
* update TODO checklist and system design for form instances ([5192a54](https://github.com/AfricanBongo/royalforms/commit/5192a5417f0d900866cfbae08b49b850f8b1ba1b))

## [0.2.1](https://github.com/AfricanBongo/royalforms/compare/v0.2.0...v0.2.1) (2026-03-09)


### Bug Fixes

* **avatar:** use full name as DiceBear seed for consistent avatars ([79f835a](https://github.com/AfricanBongo/royalforms/commit/79f835ac36566ed042b2b58cfc07480fc0d3983d))

## 0.2.0 (2026-03-09)


### Features

* **auth:** add DiceBear thumbs default avatar for onboarding ([ae508a3](https://github.com/AfricanBongo/royalforms/commit/ae508a381eda68cc6c497b45438f1bc1a92ab817))
* **auth:** add Edge Functions for bootstrap-root-admin, invite-user, and update-user-role ([5e85590](https://github.com/AfricanBongo/royalforms/commit/5e855903f39e5b6c9b0495608823bc7ed21e7a30))
* **auth:** add forgot password and reset password pages ([098e053](https://github.com/AfricanBongo/royalforms/commit/098e0530b60d800f976dbd6fe50ad7cbac3ac453))
* **auth:** add frontend auth foundation with Supabase client, hooks, and routing ([70fd7c7](https://github.com/AfricanBongo/royalforms/commit/70fd7c7dd9a7749eba644a9478970b380ed221b6))
* **auth:** add invite acceptance page with 3-step onboarding flow ([7b6413a](https://github.com/AfricanBongo/royalforms/commit/7b6413aff2a24e6ce6fed51ae29e81f0fb5cfd84))
* **auth:** implement login page matching Figma design ([7aa6acf](https://github.com/AfricanBongo/royalforms/commit/7aa6acfce67adf6df77d063d32bd7611cb987982))
* **db:** add foundation database migrations ([0def8e3](https://github.com/AfricanBongo/royalforms/commit/0def8e3cf3fb64a12d675e1dabec00417f1ff74f))
* **db:** add invite lifecycle columns and FK changes ([2900420](https://github.com/AfricanBongo/royalforms/commit/2900420541ad2c71f344d8556dca11048e845589))
* **db:** add Root Admin seed data and generate TypeScript types ([0bf6079](https://github.com/AfricanBongo/royalforms/commit/0bf60793b6b109760d617cbcd9a205b846884dce))
* **edge-functions:** add console.info logging to all Edge Functions for observability ([e097b5f](https://github.com/AfricanBongo/royalforms/commit/e097b5fcb0e7cadcda74d67f1f35c1d26b041b69))
* **edge-functions:** add invite lifecycle management with rate limiting ([8d4aaaf](https://github.com/AfricanBongo/royalforms/commit/8d4aaafe821fb26c945bc9f44ed3f029fecf9e54))
* **email:** add custom invite email template with direct app link ([7722a61](https://github.com/AfricanBongo/royalforms/commit/7722a61120b0f84174f41c01fa182cfc0dcf70e8))
* **forms:** add form template tables with RLS policies, triggers, and indexes ([0ca924d](https://github.com/AfricanBongo/royalforms/commit/0ca924d524a615cc1aa5692f914b46f31e2ae59f))
* **groups:** add group detail page with members, requests, and role-based invites ([fb4ea9c](https://github.com/AfricanBongo/royalforms/commit/fb4ea9c40f66c1982c3bc044aaed581fbb931215))
* **groups:** add invite lifecycle UI to members and requests tabs ([790bbaf](https://github.com/AfricanBongo/royalforms/commit/790bbafd84160c7ade7f734e28b46486c813d452))
* **invite:** add tiered rate limiting for email changes ([40a468b](https://github.com/AfricanBongo/royalforms/commit/40a468bcdfa5a02e95c67c3400d3ea6f9651a625))
* **layout:** add dynamic breadcrumbs with page title context ([4f1ba19](https://github.com/AfricanBongo/royalforms/commit/4f1ba19dd03a780c9cd92cca572144ff5e8d4bb8))
* **layout:** add sidebar layout with navigation and profile dropdown ([f1bd655](https://github.com/AfricanBongo/royalforms/commit/f1bd655f61939f7d47501e1d865b351a5d320720))
* **services:** add invite management service and lifecycle transitions ([45447f8](https://github.com/AfricanBongo/royalforms/commit/45447f85bee0fdfd87d3ab7c374f309d21b8ff36))
* **storage:** add avatars bucket with RLS policies and Shadcn Avatar component ([81656fc](https://github.com/AfricanBongo/royalforms/commit/81656fce4fae10428ca6411e79ed64f5a3741cbe))
* **ui:** configure blue theme from Figma, add Geist font, and relax eslint for Shadcn UI ([a25d977](https://github.com/AfricanBongo/royalforms/commit/a25d9771f944e5e0f621925606d7a8e019fe6c58)), closes [#1e3a8](https://github.com/AfricanBongo/royalforms/issues/1e3a8) [#172554](https://github.com/AfricanBongo/royalforms/issues/172554)
* **validation:** add email format validation to all forms ([1b543b9](https://github.com/AfricanBongo/royalforms/commit/1b543b9f254c26b10860b0116a88f860d7c4a4d2))


### Bug Fixes

* **auth:** redirect on sign-out and fix invite accept session handling ([88ca004](https://github.com/AfricanBongo/royalforms/commit/88ca00411bba866b5b3b7076d5ae9ede4ccd8e18))
* **auth:** redirect to home when visiting login/forgot-password while authenticated ([6bb7c3a](https://github.com/AfricanBongo/royalforms/commit/6bb7c3a00683f6e1c79fde2061304f582d05129b))
* **auth:** resolve invite link redirect and hash fragment session handling ([d61e25a](https://github.com/AfricanBongo/royalforms/commit/d61e25a59f9dd1a2172367b5df0d22e9008fd543))
* **deps:** install missing papaparse and @types/papaparse packages ([2898bab](https://github.com/AfricanBongo/royalforms/commit/2898babf9377bc3dd6f1dcded6b5139d679eefde))
* **member-requests:** add client-side rollback when direct member invite fails ([5d27a96](https://github.com/AfricanBongo/royalforms/commit/5d27a96378c1d53145e23737f9716be36b346feb))
* **supabase:** use localhost instead of 127.0.0.1 for auth redirect URLs ([eafd068](https://github.com/AfricanBongo/royalforms/commit/eafd068521d70a1ceff29a8542fcbb4097a51916))
* use default import for TanStack Router Vite plugin ([b543790](https://github.com/AfricanBongo/royalforms/commit/b543790890a20327c7f433d0905fc75590098f3c))


### Refactoring

* **auth:** consolidate error handling into unified supabase-errors module ([7d550a3](https://github.com/AfricanBongo/royalforms/commit/7d550a33d87a488850630e3ed40750709911ae85))
* **auth:** extract auth and profiles service layers ([c1d703e](https://github.com/AfricanBongo/royalforms/commit/c1d703ed322c7c75dadb19285ee462aa1ed85803))
* **types:** replace deprecated FormEvent with SubmitEvent ([149f9a1](https://github.com/AfricanBongo/royalforms/commit/149f9a1de01db75cff74e6b53a5453947fd1ba25))


### Documentation

* add groups design plans and update TODO checklist ([d01f583](https://github.com/AfricanBongo/royalforms/commit/d01f5830dd92328a3a30ddee7bf2fad9769d44e7))
* **agents:** add remote changes tracking and fix migration workflow ([d13afdf](https://github.com/AfricanBongo/royalforms/commit/d13afdfa3c626c71c950c50e219eee0bfeee9350))
* **agents:** add Shadcn UI component usage rules ([424630c](https://github.com/AfricanBongo/royalforms/commit/424630c1b4a6093da5fc31cdb26b7572e1f3d52c))
* **agents:** add Supabase MCP workflow, local dev workflow, and cross-session tracking ([6e100dd](https://github.com/AfricanBongo/royalforms/commit/6e100dd8a06ba792963e576c724a421f24ec681b))
* **plans:** add invite lifecycle management design doc ([ad46e63](https://github.com/AfricanBongo/royalforms/commit/ad46e6361d7a4684692f9fb1f4b10423d6889631))
* **system-design:** add complete system design documentation ([786ec77](https://github.com/AfricanBongo/royalforms/commit/786ec77621d23244c5e93a84815be66a0450aa31))
* **todo:** add TODO.md for cross-session progress tracking ([1db0511](https://github.com/AfricanBongo/royalforms/commit/1db051174149644e1a46dfb43bb6a4f0214c33f1))
* **todo:** check off completed auth backend and frontend foundation items ([ffb8949](https://github.com/AfricanBongo/royalforms/commit/ffb894957135457a56bc5ca56187aab8ff7a9f38))
* **todo:** check off form templates backend tasks ([a76b914](https://github.com/AfricanBongo/royalforms/commit/a76b91498b664fc506c847984c98017b12647b18))
* **todo:** check off invite acceptance page ([1bcb899](https://github.com/AfricanBongo/royalforms/commit/1bcb899e3f22c8246ec96e8b87c4f96c61a7845f))
* **todo:** check off invite lifecycle management tasks ([5713b37](https://github.com/AfricanBongo/royalforms/commit/5713b370ce4c8d84cd951734a7cc9e3450f616b7))
* **todo:** check off login, forgot password, and reset password pages ([10f6403](https://github.com/AfricanBongo/royalforms/commit/10f64035448d2a80e382e1a3122d0dd48a0bad4e))
* **todo:** check off sidebar layout, navigation, user info, and breadcrumbs ([91a9cb5](https://github.com/AfricanBongo/royalforms/commit/91a9cb5683b65505c660f5e71349a462acd8b9cd))
* **todo:** restructure TODO.md for feature-by-feature execution ([eed0c6a](https://github.com/AfricanBongo/royalforms/commit/eed0c6a829515c607175c5c1704a2964551bfe36))
