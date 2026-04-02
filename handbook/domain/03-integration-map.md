# 03 — Integration Map

## How each ACDG service interacts with the People Context

```
                         ┌──────────────────────┐
                         │    People Context     │
                         │                       │
                         │  Person (identity)    │
                         │  PersonSystemRole     │
                         └───┬───┬───┬───┬───┬───┘
                             │   │   │   │   │
            ┌────────────────┘   │   │   │   └────────────────┐
            ▼                    ▼   │   ▼                    ▼
   ┌────────────────┐  ┌────────────┐│ ┌──────────────┐  ┌────────────┐
   │  social-care   │  │   queue-   ││ │  therapies   │  │  timesheet │
   │                │  │   manager  ││ │  (future)    │  │  (future)  │
   │ Patient data,  │  │ Visits,    ││ │ Sessions,    │  │ Time       │
   │ assessments,   │  │ queues,    ││ │ treatment    │  │ records,   │
   │ family, care   │  │ panels,    ││ │ plans        │  │ shifts     │
   └────────────────┘  │ attendance ││ └──────────────┘  └────────────┘
                       └────────────┘│
                                     ▼
                            ┌────────────────┐
                            │  IAM Service   │
                            │  (future)      │
                            │ Zitadel proxy, │
                            │ user mgmt UI   │
                            └────────────────┘
```

---

## Interaction patterns

### Registration flow

```
1. Reception/Admin → POST /people
     People Context creates Person, returns PersonId

2. Consuming service → POST /people/{personId}/roles
     Assigns a system role (e.g., system: "social-care", role: "patient")

3. Consuming service stores its own data referencing PersonId
     e.g., social-care creates Patient { personId: "abc-123", diagnoses: [...] }
```

### Lookup flow

```
1. Service needs to display a person's name
     → GET /people/{personId}
     → Returns { fullName, cpf, birthDate }

2. Service needs to check if a person exists by CPF (dedup)
     → GET /people/by-cpf/{cpf}
     → Returns existing Person or 404
```

### Role query flow

```
1. "What systems is this person active in?"
     → GET /people/{personId}/roles
     → Returns [{ system: "social-care", role: "patient" }, ...]

2. "Who are all the professionals in queue-manager?"
     → GET /people/roles?system=queue-manager&role=professional
     → Returns list of PersonIds with that role
```

---

## Service-by-service breakdown

### social-care

| Action | People API call | When |
|--------|----------------|------|
| Register patient | `GET /people/by-cpf/{cpf}` (dedup check) → `POST /people` (if new) → `POST /people/{id}/roles` (patient role) | During triage |
| Add family member | `POST /people` (if new family member) → `POST /people/{id}/roles` (family-member role) | Family composition |
| Display patient name | `GET /people/{personId}` | Patient detail view |

### queue-manager

| Action | People API call | When |
|--------|----------------|------|
| Register arrival | `GET /people/{personId}` (validate existence + get name) | Patient arrives at unit |
| Register professional | `POST /people` (if new) → `POST /people/{id}/roles` (professional role) | Admin setup |
| Display on panel | Cached fullName from arrival registration | Real-time panels |

### therapies (future)

| Action | People API call | When |
|--------|----------------|------|
| Enroll patient | `POST /people/{id}/roles` (patient role in therapies) | First therapy session |
| Register therapist | `POST /people` (if new) → `POST /people/{id}/roles` (therapist role) | Therapist onboarding |

### timesheet (future)

| Action | People API call | When |
|--------|----------------|------|
| Register employee | `POST /people` (if new) → `POST /people/{id}/roles` (employee role) | Employee onboarding |
| Clock in/out | PersonId used as employee reference | Daily |

### IAM Service (future)

| Action | People API call | When |
|--------|----------------|------|
| Create user login | `GET /people/{personId}` → Creates Zitadel user with person_id claim | After triage / professional onboarding |
| Link existing user | Updates Person with authSubjectId (if People stores that mapping) | Migration |

---

## Communication protocol

| Direction | Method | Use case |
|-----------|--------|----------|
| Service → People | **HTTP (sync)** | Register person, lookup by CPF, get person, assign role |
| People → Services | **NATS (async)** | Events: person.registered, person.updated, role.assigned, role.deactivated |

Services **never write** to People's database directly. All interaction is through the People Context API.

---

## Data ownership summary

| Data | Owner | People Context knows? |
|------|-------|-----------------------|
| Person exists (PersonId, fullName, cpf, birthDate) | **People Context** | Yes — source of truth |
| System roles (who is what in each service) | **People Context** | Yes — source of truth |
| Patient diagnoses, assessments | social-care | No |
| Family relationships | social-care | No |
| Queue position, service orders | queue-manager | No |
| Professional specialty, schedule | queue-manager / timesheet | No |
| Therapy sessions, treatment plans | therapies | No |
| Auth credentials, JWT, roles | Zitadel | No |
| Work hours, shifts | timesheet | No |
