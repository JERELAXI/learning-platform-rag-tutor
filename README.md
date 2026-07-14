# Learning Platform RAG Tutor

Навчальна платформа з AI-репетитором на базі RAG. Викладач створює курси з
послідовними уроками й завантажує матеріали; студент записується на курс,
проходить уроки строго по порядку (наступний відкривається після
завершення попереднього) і ставить питання AI-репетитору, який пояснює
за сократичним методом і відповідає ТІЛЬКИ з матеріалів поточного уроку.

## Стек

Python 3.12 · FastAPI · SQLAlchemy 2.0 async · Alembic · PostgreSQL 16 +
pgvector · asyncpg · JWT (pyjwt) · bcrypt · Celery + Redis · OpenAI SDK
(`text-embedding-3-small`, `gpt-4o-mini`) · LangChain text splitters ·
pypdf / python-docx · uv · Docker Compose

## Архітектура

Модульний моноліт. Кожен домен — папка в `backend/` з файлами
`models.py`, `schemas.py`, `routes.py`, `service.py`. Міждоменні виклики —
тільки через `service.py`, FK між доменами — рядкові (`ForeignKey("users.id")`)
без прямих імпортів моделей.

- `auth` — реєстрація, JWT (access + refresh), RBAC (student/teacher/admin)
- `users` — admin-CRUD над користувачами
- `courses` — курси і уроки (+ reorder)
- `enrollments` — записи на курс і `LessonProgress` (послідовне розблокування)
- `materials` — upload PDF/TXT/DOCX → чанкінг → embeddings через Celery-worker
- `chat` — RAG-репетитор, сократичний промпт, retrieval з поріг-фільтром
- `quizzes` — AI-генерація multiple-choice питань, submit + автопрогрес

Спільне: `core/` (config, db, security, llm, celery_app, logging).

## Запуск

Передумови: **Docker + Docker Compose**, ключ до OpenAI API.

```bash
git clone <repo-url>
cd learning-platform-rag-tutor/backend

# 1) створити .env з шаблону і вписати SECRET_KEY + OPENAI_API_KEY
cp .env.example .env
# відредагувати .env (див. коментарі у файлі)

# 2) підняти всі сервіси (db, redis, web, worker)
docker compose up --build -d

# 3) застосувати міграції (окремий крок — автоматично не запускаються)
docker compose exec web uv run alembic upgrade head
```

Готово: Swagger — <http://localhost:8000/docs>.

Логи: `docker compose logs -f web` (HTTP + RAG-пошук), `docker compose logs -f worker` (обробка матеріалів).

## Створення admin

Ролі `student` і `teacher` створюються через `POST /api/auth/register`.
Роль `admin` — тільки через CLI (безпека):

```bash
docker compose exec web uv run python -m scripts.create_admin \
  --email admin@example.com --full-name "Admin"
# пароль запитає інтерактивно
```

## Демо-flow (Swagger)

1. Teacher реєструється: `POST /api/auth/register` `{"role":"teacher"}`.
2. Login: `POST /api/auth/login` (form-data `username`=email, `password`) →
   Authorize у Swagger токеном.
3. Створити курс: `POST /api/courses/` `{"title":"...","is_published":true}`.
4. Додати уроки: `POST /api/courses/{course_id}/lessons/` (кілька разів,
   `order=0,1,2,...`).
5. Завантажити матеріал: `POST /api/lessons/{lesson_id}/materials/` (файл
   .txt/.pdf/.docx). Ендпоінт повертає 202 з `status="pending"`;
   Celery-worker обробить у фоні.
6. Poll `GET /api/lessons/{lesson_id}/materials/{id}` — має стати `ready`
   (у `document_chunks` з'являться чанки з embedding).
7. Згенерувати квіз на урок: `POST /api/quizzes/generate`
   `{"lesson_id":"...","num_questions":5}`.
8. Student реєструється, логіниться, робить `POST /api/enrollments/`
   `{"course_id":"..."}`.
9. `GET /api/courses/{course_id}/lessons/` — перший урок `available`,
   решта `locked`. Питання AI: `POST /api/chat/sessions` +
   `POST /api/chat/sessions/{id}/ask`.
10. Здати квіз: `POST /api/quizzes/{quiz_id}/submit` `{"answers":[...]}`.
    Якщо `score >= pass_threshold` → урок `completed`, наступний
    розблокується автоматично.

## Ключові технічні рішення

- **pgvector в одній БД з доменними даними** замість окремої векторної БД:
  один SQL-JOIN фільтрує пошук по `lesson_id` через `Material.status='ready'`
  разом з `ORDER BY embedding <=> :q` — без двох сорсів правди й
  синхронізації індексів.
- **Двошаровий захист від галюцинацій RAG**: (а) поріг `cosine_distance`
  (`RAG_DISTANCE_THRESHOLD`, default 0.55) відкидає нерелевантні чанки; якщо
  після фільтру порожньо — endpoint повертає чесне "У матеріалах цього уроку
  немає інформації..." без виклику LLM. (б) жорсткий системний промпт з
  прямою забороною відповідати поза контекстом.
- **Сократичний тьютор**: системний промпт вимагає ставити навідні питання
  замість готових відповідей на тестові запити. LLM бачить тільки
  чанки одного (поточного) уроку — витік майбутнього контенту неможливий.
- **Celery durability**: обробка матеріалів у окремому worker-контейнері з
  Redis як брокером. Якщо worker/web впаде — задача переживає в черзі і
  доробиться на старті. Кожен таск створює свій `AsyncEngine`, щоб asyncpg
  пул був прив'язаний до нового event loop (`asyncio.run()`).
- **Self-heal `LessonProgress`**: якщо викладач додав урок ПІСЛЯ того,
  як студент вже enrolled — прогрес-запис створюється ліниво при першому
  зверненні (`get_lesson_status` обчислює `available`/`locked` за станом
  попереднього уроку). Замість bulk-бекфілу — ідемпотентне самозцілення.

## Специфікація

Повна специфікація — `project_spec.md`. Внутрішні правила розробки —
`CLAUDE.md`.
