# Chat System (Distributed)

Run everything with Docker:

- Copy `.env.example` to `.env` in `backend/` and `load-balancer/`.
- Then run:

```
docker compose up --build
```

Services:
- Load balancer: http://localhost:4000
- Frontend: http://localhost:5173
- Backend1: http://localhost:4001
- Backend2: http://localhost:4002
- Redis: redis://localhost:6379
- Postgres: localhost:5432

Basic flow:
- Frontend calls `GET /route` on the load balancer to get `{ ws, http }` for Socket.IO and REST.
- Backends persist users, conversations, and messages in Postgres.
- Redis manages server counts, presence, cache, and heartbeats.
