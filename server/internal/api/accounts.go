package api

import (
	"net/http"

	"github.com/shadowline/server/internal/auth"
	"github.com/shadowline/server/internal/store"
)

// accountPage is how many people the console lists at once.
const accountPage = 50

// account is a row of the console's list, with whether the address is an owner
// — in ADMIN_EMAILS, so an admin the console cannot change.
type account struct {
	store.Account
	Owner bool `json:"owner"`
}

func (s *Server) accountOf(a store.Account) account {
	return account{Account: a, Owner: s.Cfg.IsAdmin(a.Email)}
}

// handleListAccounts is everybody who has signed in, newest first, searched by
// name or address and filtered to admins or suspended accounts.
func (s *Server) handleListAccounts(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	filter := query.Get("filter")
	switch filter {
	case store.UsersAll, store.UsersAdmins, store.UsersSuspended:
	default:
		fail(w, http.StatusBadRequest, "filter is admins, suspended, or nothing")
		return
	}
	limit := intParam(query.Get("limit"), accountPage, 1, 200)
	offset := intParam(query.Get("offset"), 0, 0, 1<<20)

	found, total, err := s.Store.Accounts(r.Context(), query.Get("q"), filter, limit, offset)
	if err != nil {
		s.failErr(w, err, "list accounts")
		return
	}
	out := make([]account, len(found))
	for i, a := range found {
		out[i] = s.accountOf(a)
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out, "total": total})
}

// handleUpdateAccount makes somebody an admin or not, and suspends or restores
// them.
//
// Two things are refused. Your own account: the one change an admin could make
// here that nobody could then undo is taking away their own rights. And an
// owner's rights or standing: ADMIN_EMAILS is the deployment's own say in who
// runs it, and is changed where it is set.
func (s *Server) handleUpdateAccount(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(w, r)
	if !ok {
		return
	}
	var body struct {
		Admin     *bool `json:"admin"`
		Suspended *bool `json:"suspended"`
	}
	if err := decodeJSON(r, &body); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Admin == nil && body.Suspended == nil {
		fail(w, http.StatusBadRequest, "nothing to change")
		return
	}

	me, _ := auth.UserFrom(r.Context())
	if id == me.ID {
		fail(w, http.StatusConflict, "you cannot change your own access — ask another admin")
		return
	}
	target, err := s.Store.AccountByID(r.Context(), id)
	if err != nil {
		s.failErr(w, err, "get account")
		return
	}
	owner := s.Cfg.IsAdmin(target.Email)
	if owner && ((body.Admin != nil && !*body.Admin) || (body.Suspended != nil && *body.Suspended)) {
		fail(w, http.StatusConflict, target.Email+" is in ADMIN_EMAILS — change it there")
		return
	}

	updated, err := s.Store.SetAccess(r.Context(), id, owner,
		store.AccessChange{Admin: body.Admin, Suspended: body.Suspended})
	if err != nil {
		s.failErr(w, err, "change access")
		return
	}
	s.Log.Info("account access changed", "by", me.Email, "account", updated.Email,
		"admin", updated.IsAdmin, "suspended", updated.SuspendedAt != nil)
	writeJSON(w, http.StatusOK, s.accountOf(updated))
}
