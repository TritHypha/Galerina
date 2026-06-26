# HTTP Method Declarations

## Definition

Galerina treats HTTP methods as **declared governed entry points**, not automatic permissions. A method is only allowed for a path if it is explicitly declared in a route.

```text
No route exists unless declared.
No method is allowed unless declared.
No data enters unless it matches a request schema.
No data leaves unless it matches a response schema and view rules.
```

## Core Model

```galerina
route GET "/profile/{id}" {
  request Profile.get
  response Profile.response
  flow getProfile
  permission use profile_read
}
```

If someone sends `POST /profile/123`, the runtime returns `405 Method Not Allowed` because `POST` was not declared.

## Request Schemas by Method

Each HTTP method gets a typed request model:

```galerina
data Profile {
  request get {
    id: ProfileId required
  }

  request update {
    id: ProfileId required
    name: String max 80
    email: Email
  }

  view response {
    id: ProfileId view: public
    name: String view: public
    email: Email view: private
  }
}
```

## Method Semantics

```text
GET    = read-style route, still requires permission
POST   = create/action route, still requires permission
PUT    = replace/update route, still requires permission
PATCH  = partial update route, still requires permission
DELETE = delete route, still requires permission
```

Galerina does not trust HTTP method meaning alone:

```text
GET does not automatically mean safe.
POST does not automatically mean allowed.
DELETE does not automatically mean forbidden.
```

The permission decides authority, not the method name.

## Permission Example

```galerina
permission profile_read {
  code {
    allow db.read table: Profiles
  }

  data {
    allow read Profiles fields: [id, owner, name, email]
    allow expose view: public
    allow expose view: private
  }

  audit optional event "profile.read"
}

permission profile_update {
  code {
    allow db.read table: Profiles
    allow db.write table: Profiles
  }

  data {
    allow read Profiles fields: [id, owner]
    allow write Profiles fields: [name, email]
    allow expose view: public
    allow expose view: private
  }

  audit required event "profile.update"
}
```

## Route Declarations

```galerina
route GET "/profile/{id}" {
  request Profile.get
  response Profile.response
  flow getProfile
  permission use profile_read
}

route PUT "/profile/{id}" {
  request Profile.update
  response Profile.response
  flow updateProfile
  permission use profile_update
}
```

## Core Principle

```text
HTTP method declares intent.
Permission grants authority.
Schema controls input.
View controls output.
Runtime enforces all of it.
```
