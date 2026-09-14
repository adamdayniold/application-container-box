"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Contact, ContactInput } from "@/app/lib/contacts";

type ContactForm = ContactInput;
const emptyForm: ContactForm = { name: "", email: "", company: "", role: "", status: "Lead" };

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    async function loadContacts() {
      try {
        const response = await fetch("/api/contacts");
        if (!response.ok) throw new Error("Unable to load contacts.");
        setContacts(await response.json());
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load contacts.");
      } finally { setIsLoading(false); }
    }
    void loadContacts();
  }, []);
  const visibleContacts = useMemo(() => contacts.filter((c) => [c.name, c.email, c.company, c.role].join(" ").toLowerCase().includes(query.toLowerCase()) && (statusFilter === "All" || c.status === statusFilter)), [contacts, query, statusFilter]);
  const openCreate = () => { setEditing(null); setForm(emptyForm); };
  const openEdit = (contact: Contact) => { setEditing(contact); setForm({ name: contact.name, email: contact.email, company: contact.company, role: contact.role, status: contact.status }); };
  const closePanel = () => { setEditing(null); setForm(emptyForm); };
  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try {
      const response = await fetch(editing ? `/api/contacts/${editing.id}` : "/api/contacts", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save contact.");
      setContacts((all) => editing ? all.map((contact) => contact.id === editing.id ? result : contact) : [result, ...all]);
      closePanel();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save contact."); }
  }
  async function deleteContact(contact: Contact) {
    if (!window.confirm(`Delete ${contact.name}? This cannot be undone.`)) return;
    setError("");
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete contact.");
      setContacts((all) => all.filter((item) => item.id !== contact.id));
      if (editing?.id === contact.id) closePanel();
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Unable to delete contact."); }
  }
  const activeCount = contacts.filter((c) => c.status === "Active").length;
  const leadCount = contacts.filter((c) => c.status === "Lead").length;
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">c</span>
        <span>Canvas</span>
      </div>
      <nav aria-label="Main navigation">
        <a className="nav-item" href="#overview">
          <span>⌂</span> Overview
        </a>
        <a className="nav-item active" href="#contacts">
          <span>♙</span> Contacts <b>{contacts.length}</b>
        </a>
        <a className="nav-item" href="#companies">
          <span>▣</span> Companies
        </a>
        <a className="nav-item" href="#activity">
          <span>◷</span> Activity
        </a>
      </nav>
      <div className="sidebar-bottom">
        <a className="nav-item" href="#settings">
          <span>⚙</span> Settings
        </a>
        <div className="user-card">
          <div className="avatar avatar-violet">AD</div>
          <div><strong>Adam Day</strong><small>Workspace owner</small></div>
          <span className="dots">···</span>
        </div>
      </div>
    </aside>
    <section className="content" id="contacts">
      <header className="topbar">
        <div>
          <p className="eyebrow">Workspace / People</p>
          <h1>Contacts</h1>
          <p className="subtitle">Keep your people and relationships in one place.</p>
        </div>
        <button className="primary-button" onClick={openCreate}>
          <span>＋</span> Add contact
        </button>
      </header>{error && <p className="api-error" role="alert">{error}</p>}
      <section className="stat-grid" aria-label="Contact summary">
        <article>
          <p>Total contacts</p>
          <strong>{contacts.length}</strong>
          <span className="stat-note positive">↗ 12% <em>vs last month</em></span>
        </article>
        <article>
          <p>Active contacts</p>
          <strong>{activeCount}</strong>
          <span className="stat-note">{contacts.length ? Math.round(activeCount / contacts.length * 100) : 0}% of total</span>
        </article>
        <article>
          <p>New leads</p>
          <strong>{leadCount}</strong>
          <span className="stat-note">Ready to follow up</span>
        </article>
      </section>
      <section className="table-card">
        <div className="table-toolbar">
          <div className="search-wrap">
            <span>⌕</span>
            <input aria-label="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts..." />
          </div>
          <div className="filter-row">
            <span>Filter:</span>{["All", "Active", "Lead", "Inactive"].map((filter) => <button key={filter} onClick={() => setStatusFilter(filter)} className={statusFilter === filter ? "filter active-filter" : "filter"}>{filter}</button>)}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? 
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">Loading contacts…</div>
                </td>
              </tr>
               : visibleContacts.map((contact) => <tr key={contact.id}>
                <td>
                  <div className="contact-name">
                    <div className={`avatar avatar-${contact.color}`}>{initials(contact.name)}</div>
                    <div><strong>{contact.name}</strong><small>{contact.email}</small></div>
                  </div>
                </td>
                <td>{contact.company}</td>
                <td>{contact.role}</td>
                <td><span className={`status status-${contact.status.toLowerCase()}`}>{contact.status}</span></td>
                <td>
                  <div className="row-actions">
                    <button aria-label={`Edit ${contact.name}`} onClick={() => openEdit(contact)}>Edit</button>
                    <button className="delete" aria-label={`Delete ${contact.name}`} onClick={() => deleteContact(contact)}>Delete</button>
                  </div>
                </td>
              </tr>)}
              {!isLoading && visibleContacts.length === 0 && <tr>
                <td colSpan={5}>
                  <div className="empty-state">No contacts match your search. Try another filter or add someone new.</div>
                </td>
              </tr>}
            </tbody>
          </table>
        </div>
        <footer className="table-footer">
          <span>Showing {visibleContacts.length} of {contacts.length} contacts</span>
          <div>
            <button className="page-button" disabled>‹</button>
            <button className="page-button current">1</button>
            <button className="page-button" disabled>›</button>
          </div>
        </footer>
      </section>
    </section>
    <aside className="form-panel" aria-label={editing ? "Edit contact" : "Add contact"}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{editing ? "Update record" : "New record"}</p>
          <h2>{editing ? "Edit contact" : "Add a contact"}</h2>
        </div>{(editing || form.name || form.email) && <button className="close-button" onClick={closePanel} aria-label="Close form">×</button>}
      </div>
      <p className="panel-copy">{editing ? "Make changes and save when you’re ready." : "Create a contact to start building your workspace."}</p>
      <form onSubmit={submitForm}>
        <label>Name
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jordan Lee" />
        </label>
        <label>Email
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jordan@company.com" />
        </label>
        <label>Company
          <input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
        </label>
        <label>Role
          <input required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Job title" />
        </label>
        <label>Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContactForm["status"] })}>
            <option>Lead</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={closePanel}>Cancel</button>
          <button className="primary-button" type="submit">{editing ? "Save changes" : "Create contact"}</button>
        </div>
      </form>
    </aside>
  </main>;
}
function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2); }
