-- Dev dataset for manual checks: books, movies, subscriptions and licenses with varied states.
-- Local use only; there is no mock login, so it fills the account of a user who has signed in with GitHub.
--
--   docker compose -f deploy/docker/docker-compose.yml exec -T postgres psql -U rwx -v ON_ERROR_STOP=1 -f - < deploy/docker/dev-seed.sql
--
-- Target: the most recently created user who signed in with GitHub (a user without credentials, such as the local
-- self-test user, is skipped); pass -v user_id=<uuid> to choose another. Re-running is safe: the seeded
-- rows have fixed ids and are replaced (reminder dates are relative to today, so a re-run refreshes them). Other rows
-- of the user are not touched. Books and movies marked open_library and tmdb are real works (ids, links, covers and
-- posters taken from the public sources); ratings, statuses and favourites are made up. The drafts have no cover on purpose.

\if :{?user_id}
\else
  \set user_id ''
\endif

BEGIN;

CREATE TEMP TABLE target AS
SELECT COALESCE(NULLIF(:'user_id', '')::uuid, (SELECT u.id FROM users u WHERE EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = u.id) ORDER BY u.created_at DESC LIMIT 1)) AS id;

DO $$ BEGIN
  IF (SELECT id FROM target) IS NULL THEN
    RAISE EXCEPTION 'No user yet: sign in with GitHub first';
  END IF;
END $$;

-- ---------------------------------------------------------------- books (Open Library works with real ids and covers, plus drafts)
CREATE TEMP TABLE seed_books AS
SELECT md5('rwx-seed:book:' || n)::uuid AS id, * FROM (VALUES
  (1, 'Dune', 'Frank Herbert', '1965', '4.5', 'seen', true, $d$Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides, heir to a noble family tasked with ruling an inhospitable world where the only thing of value is the "spice" melange, a drug capable of extending life and enhancing consciousness. Coveted across the known universe, melange is a prize worth killing for...

When House Atreides is betrayed, the destruction of Paul's family will set the boy on a journey toward a destiny greater than he could ever have imagined. And as he evolves into the mysterious man known as Muad'Dib, he will bring to fruition humankind's most ancient and unattainable dream.

A stunning blend of adventure and mysticism, environmentalism and politics, Dune won the first Nebula Award, shared the Hugo Award, and formed the basis of what is undoubtedly the grandest epic in science fiction.$d$, 'https://covers.openlibrary.org/b/id/11481354-M.jpg', '9780340960196', 'open_library', 'OL893414W', 'https://openlibrary.org/works/OL893414W'),
  (2, 'Nineteen Eighty-Four', 'George Orwell', '1949', '4.0', 'seen', false, $d$Nineteen Eighty-Four: A Novel, often referred to as 1984, is a dystopian social science fiction novel by the English novelist George Orwell (the pen name of Eric Arthur Blair). It was published on 8 June 1949 by Secker & Warburg as Orwell's ninth and final book completed in his lifetime. Thematically, Nineteen Eighty-Four centres on the consequences of totalitarianism, mass surveillance, and repressive regimentation of persons and behaviours within society. Orwell, himself a democratic socialist, modelled the authoritarian government in the novel after Stalinist Russia. More broadly, the novel examines the role of truth and facts within politics and the ways in which they are manipulated.

----------		
Also contained in:		
[Novels (Animal Farm / Burmese Days / Clergyman's Daughter / Coming Up for Air / Keep the Aspidistra Flying / Nineteen Eighty-Four)](https://openlibrary.org/works/OL1168045W)		
[Novels (Animal Farm / Nineteen Eighty-Four)](https://openlibrary.org/works/OL1167981W)
[Orwell's Nineteen Eighty-Four: Text, Sources, Criticism](https://openlibrary.org/works/OL1168095W)$d$, 'https://covers.openlibrary.org/b/id/9267242-M.jpg', '1787302547', 'open_library', 'OL1168083W', 'https://openlibrary.org/works/OL1168083W'),
  (3, 'The Hobbit', 'J.R.R. Tolkien', '1937', NULL, 'planned', true, $d$The Hobbit is a tale of high adventure, undertaken by a company of dwarves in search of dragon-guarded gold. A reluctant partner in this perilous quest is Bilbo Baggins, a comfort-loving unambitious hobbit, who surprises even himself by his resourcefulness and skill as a burglar.

Encounters with trolls, goblins, dwarves, elves, and giant spiders, conversations with the dragon, Smaug, and a rather unwilling presence at the Battle of Five Armies are just some of the adventures that befall Bilbo.

Bilbo Baggins has taken his place among the ranks of the immortals of children’s fiction. Written by Professor Tolkien for his children, The Hobbit met with instant critical acclaim when published.$d$, 'https://covers.openlibrary.org/b/id/14627509-M.jpg', '9788422615866', 'open_library', 'OL27482W', 'https://openlibrary.org/works/OL27482W'),
  (4, 'Pride and Prejudice', 'Jane Austen', '1813', '3.5', 'seen', false, $d$Pride and Prejudice is an 1813 novel of manners written by Jane Austen. The novel follows the character development of Elizabeth Bennet, the dynamic protagonist of the book who learns about the repercussions of hasty judgments and comes to appreciate the difference between superficial goodness and actual goodness.

Mr. Bennet, owner of the Longbourn estate in Hertfordshire, has five daughters, but his property is entailed and can only be passed to a male heir. His wife also lacks an inheritance, so his family faces becoming very poor upon his death. Thus, it is imperative that at least one of the girls marry well to support the others, which is a motivation that drives the plot.$d$, 'https://covers.openlibrary.org/b/id/14348537-M.jpg', '9781013815584', 'open_library', 'OL66554W', 'https://openlibrary.org/works/OL66554W'),
  (5, 'Frankenstein; or, The Modern Prometheus', 'Mary Shelley', '1818', NULL, 'planned', false, $d$*Frankenstein; or, The Modern Prometheus* is an 1818 novel written by English author Mary Shelley. Frankenstein tells the story of Victor Frankenstein, a young scientist who creates a sapient creature in an unorthodox scientific experiment. Shelley started writing the story when she was 18, and the first edition was published anonymously in London on 1 January 1818, when she was 20. Her name first appeared in the second edition, which was published in Paris in 1821.$d$, 'https://covers.openlibrary.org/b/id/12356249-M.jpg', NULL, 'open_library', 'OL450063W', 'https://openlibrary.org/works/OL450063W'),
  (6, 'Neuromancer', 'William Gibson', '1984', '4.0', 'seen', false, $d$The first of William Gibson's Sprawl trilogy, *Neuromancer* is the classic cyberpunk novel. The winner of the Hugo, Nebula, and Philip K. Dick Awards, *Neuromancer* was the first fully-realized glimpse of humankind’s digital future — a shocking vision that has challenged our assumptions about our technology and ourselves, reinvented the way we speak and think, and forever altered the landscape of our imaginations.

Henry Dorsett Case was the sharpest data-thief in the business, until vengeful former employees crippled his nervous system. But now a new and very mysterious employer recruits him for a last-chance run. The target: an unthinkably powerful artificial intelligence orbiting Earth in service of the sinister Tessier-Ashpool business clan. With a dead man riding shotgun and Molly, mirror-eyed street-samurai, to watch his back, Case embarks on an adventure that ups the ante on an entire genre of fiction.

Hotwired to the leading edges of art and technology, *Neuromancer* is a cyberpunk, science fiction masterpiece — a classic that ranks with *1984* and *Brave New World* as one of the twentieth century’s most potent visions of the future.$d$, 'https://covers.openlibrary.org/b/id/283860-M.jpg', '9783608504880', 'open_library', 'OL27258W', 'https://openlibrary.org/works/OL27258W'),
  (7, 'Solaris', 'Stanisław Lem', '1961', NULL, 'planned', false, $d$The cult-classic by Stanislaw Lem that spawned the movie is now available for your Kindle! Until now the only English edition was a 1970 version, which was translated from French and which Lem himself described as a "poor translation." This wonderful new English translation (by Bill Johnston) of Lem's classic Solaris is a must-have for fans of Lem's classic novel.

Telling of humanity's encounter with an alien intelligence on the planet Solaris, the 1961 novel is a cult classic, exploring the ultimate futility of attempting to communicate with extra-terrestrial life.

When Kris Kelvin arrives at the planet Solaris to study the ocean that covers its surface, he finds a painful, hitherto unconscious memory embodied in the living physical likeness of a long-dead lover. Others examining the planet, Kelvin learns, are plagued with their own repressed and newly corporeal memories. The Solaris ocean may be a massive brain that creates these incarnate memories, though its purpose in doing so is unknown, forcing the scientists to shift the focus of their quest and wonder if they can truly understand the universe without first understanding what lies within their hearts.$d$, NULL, NULL, 'open_library', 'OL109524W', 'https://openlibrary.org/works/OL109524W'),
  (8, 'Мастер и Маргарита', 'Михаил Булгаков', '1967', '5.0', 'seen', true, NULL, NULL, NULL, 'draft', 'Мастер и Маргарита', 'https://www.google.com/search?q=%D0%9C%D0%B0%D1%81%D1%82%D0%B5%D1%80%20%D0%B8%20%D0%9C%D0%B0%D1%80%D0%B3%D0%B0%D1%80%D0%B8%D1%82%D0%B0'),
  (9, 'Тіні забутих предків', 'Михайло Коцюбинський', '1911', '4.0', 'planned', false, NULL, NULL, NULL, 'draft', 'Тіні забутих предків', 'https://www.google.com/search?q=%D0%A2%D1%96%D0%BD%D1%96%20%D0%B7%D0%B0%D0%B1%D1%83%D1%82%D0%B8%D1%85%20%D0%BF%D1%80%D0%B5%D0%B4%D0%BA%D1%96%D0%B2'),
  (10, 'Notes from a small corner of the quiet countryside where nothing ever happens and everyone knows everyone', NULL, NULL, NULL, 'planned', false, NULL, NULL, NULL, 'draft', 'Notes from a small corner of the quiet countryside where nothing ever happens and everyone knows everyone', 'https://www.google.com/search?q=Notes%20from%20a%20small%20corner%20of%20the%20quiet%20countryside%20where%20nothing%20ever%20happens%20and%20everyone%20knows%20everyone'),
  (11, 'Draft only', 'No Source', NULL, '2.0', 'seen', false, NULL, NULL, NULL, 'draft', 'Draft only', 'https://www.google.com/search?q=Draft%20only')
) AS v(n, title, author, year, rating, status, is_favorite, description, cover_url, isbn, source, external_id, external_link);

DELETE FROM books WHERE user_id = (SELECT id FROM target) AND id IN (SELECT id FROM seed_books);
INSERT INTO books (id, user_id, title, author, year, rating, status, is_favorite, description, cover_url, isbn, source, external_id, external_link, updated_at)
SELECT id, (SELECT id FROM target), title, author, year::int, rating::numeric, status, is_favorite, description, cover_url, isbn, source, external_id, external_link,
       now() - make_interval(hours => n)
FROM seed_books;

-- ---------------------------------------------------------------- movies and TV (TMDb items with real ids and posters, plus drafts)
CREATE TEMP TABLE seed_movies AS
SELECT md5('rwx-seed:movie:' || n)::uuid AS id, * FROM (VALUES
  (1, 'Inception', 'Inception', '2010', '4.5', 'movie', NULL, NULL, 'seen', true, $d$Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance to regain his old life as payment for a task considered to be impossible: "inception", the implantation of another person's idea into a target's subconscious.$d$, 'https://image.tmdb.org/t/p/w342/4Kc9ij5DeAwexVwVoT0fGHWK5WM.jpg', 'tmdb', '27205', 'https://www.themoviedb.org/movie/27205'),
  (2, 'Fight Club', 'Fight Club', '1999', '4.0', 'movie', NULL, NULL, 'seen', false, $d$A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy. Their concept catches on, with underground "fight clubs" forming in every town, until an eccentric gets in the way and ignites an out-of-control spiral toward oblivion.$d$, 'https://image.tmdb.org/t/p/w342/74RcH5EIo9IrPIgsZw7mGd989tW.jpg', 'tmdb', '550', 'https://www.themoviedb.org/movie/550'),
  (3, 'The Matrix', 'The Matrix', '1999', NULL, 'movie', NULL, NULL, 'planned', true, $d$Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.$d$, 'https://image.tmdb.org/t/p/w342/zgJgkFJrLPWQaBtVx9OtTeMrJmo.jpg', 'tmdb', '603', 'https://www.themoviedb.org/movie/603'),
  (4, 'Interstellar', 'Interstellar', '2014', '5.0', 'movie', NULL, NULL, 'seen', true, $d$The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.$d$, 'https://image.tmdb.org/t/p/w342/6KiSSndIMLj1swkpPNq2lYppDVQ.jpg', 'tmdb', '157336', 'https://www.themoviedb.org/movie/157336'),
  (5, 'Parasite', '기생충', '2019', NULL, 'movie', NULL, NULL, 'planned', false, $d$All unemployed, Ki-taek's family takes peculiar interest in the wealthy and glamorous Parks for their livelihood until they get entangled in an unexpected incident.$d$, 'https://image.tmdb.org/t/p/w342/kIvu99VgwSikNBVzcfGTF837rHc.jpg', 'tmdb', '496243', 'https://www.themoviedb.org/movie/496243'),
  (6, 'Spirited Away', '千と千尋の神隠し', '2001', '4.5', 'movie', NULL, NULL, 'seen', false, $d$A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had to free her family.$d$, 'https://image.tmdb.org/t/p/w342/2bZSC3KJcVLLTE9beTI21Nd0v6E.jpg', 'tmdb', '129', 'https://www.themoviedb.org/movie/129'),
  (7, 'Breaking Bad', 'Breaking Bad', '2008', '5.0', 'tv', '5', 'ended', 'seen', true, $d$Walter White, a New Mexico chemistry teacher, is diagnosed with Stage III cancer and given a prognosis of only two years left to live. He becomes filled with a sense of fearlessness and an unrelenting desire to secure his family's financial future at any cost as he enters the dangerous world of drugs and crime.$d$, 'https://image.tmdb.org/t/p/w342/rB2zuh010Qh7LS1qgqG319kTx0H.jpg', 'tmdb', '1396', 'https://www.themoviedb.org/tv/1396'),
  (8, 'Dark', 'Dark', '2017', '4.5', 'tv', '3', 'ended', 'planned', false, $d$A missing child sets four families on a frantic hunt for answers as they unearth a mind-bending mystery that spans three generations.$d$, 'https://image.tmdb.org/t/p/w342/pIlwYFoSOzqTJjMoLpgxBeiN2Pl.jpg', 'tmdb', '70523', 'https://www.themoviedb.org/tv/70523'),
  (9, 'Severance', 'Severance', '2022', NULL, 'tv', '2', 'ongoing', 'planned', false, $d$Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. When a mysterious colleague appears outside of work, it begins a journey to discover the truth about their jobs.$d$, 'https://image.tmdb.org/t/p/w342/rm6ET9oocRwD9xoo4442dlV7rtP.jpg', 'tmdb', '95396', 'https://www.themoviedb.org/tv/95396'),
  (10, 'The Bear', 'The Bear', '2022', '3.5', 'tv', NULL, 'ongoing', 'seen', false, $d$Carmy, a young fine-dining chef, comes home to Chicago to run his family sandwich shop. As he fights to transform the shop and himself, he works alongside a rough-around-the-edges crew that ultimately reveal themselves as his chosen family.$d$, 'https://image.tmdb.org/t/p/w342/y1BoozfWnHPI3aTRLzZ1bHSaZiq.jpg', 'tmdb', '136315', 'https://www.themoviedb.org/tv/136315'),
  (11, 'Chernobyl', 'Chernobyl', '2019', '4.0', 'tv', '1', 'ended', 'seen', false, $d$The true story of one of the worst man-made catastrophes in history: the catastrophic nuclear accident at Chernobyl. A tale of the brave men and women who sacrificed to save Europe from unimaginable disaster.$d$, 'https://image.tmdb.org/t/p/w342/bpTdFziBQAx1g9hhhZeLRubRVK0.jpg', 'tmdb', '87108', 'https://www.themoviedb.org/tv/87108'),
  (12, 'Брат', NULL, '1997', '4.0', 'movie', NULL, NULL, 'seen', false, NULL, NULL, 'draft', 'Брат', 'https://www.google.com/search?q=%D0%91%D1%80%D0%B0%D1%82'),
  (13, 'Тіні забутих предків', NULL, NULL, NULL, 'movie', NULL, NULL, 'planned', false, NULL, NULL, 'draft', 'Тіні забутих предків', 'https://www.google.com/search?q=%D0%A2%D1%96%D0%BD%D1%96%20%D0%B7%D0%B0%D0%B1%D1%83%D1%82%D0%B8%D1%85%20%D0%BF%D1%80%D0%B5%D0%B4%D0%BA%D1%96%D0%B2'),
  (14, 'A very long film title that keeps going to see how the card and the detail sheet wrap it on a narrow phone screen', NULL, NULL, '1.5', 'movie', NULL, NULL, 'seen', false, NULL, NULL, 'draft', 'A very long film title that keeps going to see how the card and the detail sheet wrap it on a narrow phone screen', 'https://www.google.com/search?q=A%20very%20long%20film%20title%20that%20keeps%20going%20to%20see%20how%20the%20card%20and%20the%20detail%20sheet%20wrap%20it%20on%20a%20narrow%20phone%20screen')
) AS v(n, title, original_title, year, rating, type, season_count, tv_status, status, is_favorite, description, poster_url, source, external_id, external_link);

DELETE FROM movies WHERE user_id = (SELECT id FROM target) AND id IN (SELECT id FROM seed_movies);
INSERT INTO movies (id, user_id, title, original_title, year, rating, type, season_count, tv_status, status, is_favorite, description, poster_url, source, external_id, external_link, updated_at)
SELECT id, (SELECT id FROM target), title, original_title, year::int, rating::numeric, type, season_count::int, tv_status, status, is_favorite, description, poster_url, source, external_id, external_link,
       now() - make_interval(hours => n)
FROM seed_movies;

-- ---------------------------------------------------------------- subscriptions and licenses (dates relative to today)
-- days: expiry minus today (NULL for lifetime)
CREATE TEMP TABLE seed_reminders AS
SELECT * FROM (VALUES
  ('subscription', 1,  'Netflix',                  -12,  'monthly',  NULL, 3, '15.49 USD',  'Family plan, 4 screens', NULL),
  ('subscription', 2,  'Spotify Premium',          0,    'monthly',  NULL, 3, '9.99 EUR',   NULL, NULL),
  ('subscription', 3,  'iCloud 200 GB',            2,    'monthly',  NULL, 5, '2.99 USD',   NULL, NULL),
  ('subscription', 4,  'YouTube Premium',          9,    'monthly',  NULL, 7, '13.99 USD',  NULL, NULL),
  ('subscription', 5,  'Gym membership',           14,   'custom',   90,   14, '120 USD',   'Quarterly, renews by card', NULL),
  ('subscription', 6,  'Domain rwx.example',       45,   'yearly',   NULL, 7, '12 USD',     NULL, NULL),
  ('subscription', 7,  'Insurance',                200,  'yearly',   NULL, 14, '640 EUR',   'Policy 7741-22, call before renewal', NULL),
  ('subscription', 8,  'Concert tickets',          30,   'none',     NULL, 3, NULL,         'One-off, nothing to renew', NULL),
  ('subscription', 9,  'Подписка на ChatGPT и очень длинное название, чтобы проверить перенос строк в карточке', 6, 'monthly', NULL, 3, '20 USD', NULL, NULL),
  ('subscription', 10, 'Lifetime cloud storage',   NULL, 'lifetime', NULL, 3, '299 USD',    'Paid once in 2021', NULL),
  ('license',      1,  'JetBrains All Products',   -3,   'yearly',   NULL, 7, '289 USD',    NULL, 'JB-XXXX-7F3A-91C2-0001'),
  ('license',      2,  'Adobe Lightroom',          1,    'monthly',  NULL, 3, '9.99 USD',   NULL, NULL),
  ('license',      3,  'Parallels Desktop',        20,   'yearly',   NULL, 14, '99.99 USD', 'Pro edition', 'PD-1234-ABCD-5678-EFGH'),
  ('license',      4,  'Sublime Text',             NULL, 'lifetime', NULL, 3, '99 USD',     NULL, 'SUBL-LIFETIME-0000-1111-2222'),
  ('license',      5,  'SSL certificate',          60,   'custom',   365,  14, NULL,        NULL, NULL),
  ('license',      6,  'Windows 11 Pro',           NULL, 'lifetime', NULL, 3, NULL,         NULL, 'W11P-AAAAA-BBBBB-CCCCC-DDDDD'),
  ('license',      7,  'Лицензия на ПО (бессрочная, но с датой)', 400, 'none', NULL, 7, '1500 USD', 'Support ends on the date', NULL)
) AS v(kind, n, name, days, renewal_pattern, custom_days, remind_days, cost, description, license_key);

DELETE FROM subscriptions WHERE user_id = (SELECT id FROM target)
  AND id IN (SELECT md5('rwx-seed:subscription:' || n)::uuid FROM seed_reminders WHERE kind = 'subscription');
INSERT INTO subscriptions (id, user_id, name, expiry_date, renewal_pattern, custom_renewal_days, remind_days, cost, description)
SELECT md5('rwx-seed:subscription:' || n)::uuid, (SELECT id FROM target), name, current_date + days, renewal_pattern, custom_days, remind_days, cost, description
FROM seed_reminders WHERE kind = 'subscription';

DELETE FROM licenses WHERE user_id = (SELECT id FROM target)
  AND id IN (SELECT md5('rwx-seed:license:' || n)::uuid FROM seed_reminders WHERE kind = 'license');
INSERT INTO licenses (id, user_id, name, expiry_date, renewal_pattern, custom_renewal_days, remind_days, cost, description, license_key)
SELECT md5('rwx-seed:license:' || n)::uuid, (SELECT id FROM target), name, current_date + days, renewal_pattern, custom_days, remind_days, cost, description, license_key
FROM seed_reminders WHERE kind = 'license';

COMMIT;

SELECT 'books' AS entity, count(*) FROM books WHERE user_id = (SELECT id FROM target) AND deleted_at IS NULL
UNION ALL SELECT 'movies', count(*) FROM movies WHERE user_id = (SELECT id FROM target) AND deleted_at IS NULL
UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions WHERE user_id = (SELECT id FROM target) AND deleted_at IS NULL
UNION ALL SELECT 'licenses', count(*) FROM licenses WHERE user_id = (SELECT id FROM target) AND deleted_at IS NULL;
