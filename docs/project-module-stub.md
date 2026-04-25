# Client Project Module — Concept Stub

**Status:** Logged concept — not yet scoped, not yet designed, not yet built  
**Created:** April 2026  
**Applies to:** SF Ops platform (not Sonja HQ)  
**Decision reference:** D-012 (SF website stays separate), OI-006  

---

## What This Is

A future opt-in module for SF Ops that gives clients a project management tool inside their SF dashboard. Clients who have additional SF modules would have a place to track their own projects, tasks, and initiatives — not just view reports.

This is a concept stub. Nothing here is decided. It is logged so the idea is not lost and so it can be properly scoped in a future session.

---

## The Core Idea

SF Ops client dashboard is currently positioned as a hub and overview — clients see their modules, their data, their status. What's missing is a place for clients to manage their own work *inside* SF rather than in a separate tool.

A project module would give clients:
- A way to track projects tied to their SF work (work orders, invoices, contractor activity)
- Task management connected to their SF data
- A collaboration space inside the platform they already use

---

## Questions That Need Answers Before Scoping

These are the questions that must be resolved before this module can be designed:

1. **Who is the primary user?** The client themselves, or Sonja managing on their behalf?
2. **Is this a white-label module for all SF subscribers, or specific to certain tiers?**
3. **How does it connect to existing modules?** Can a project link to a work order? To an invoice?
4. **What is the minimum viable version?** Task list? Kanban? Full project tracker?
5. **Does this overlap with Sonja HQ's Project Tracker?** If so, how are they different?
6. **Pricing:** Is this an add-on module with separate pricing, or included in a tier?
7. **Does this need collaboration features?** Multiple client users on one project?

---

## What It Is NOT

- Not a replacement for Sonja HQ's Project Tracker (that is internal, for Sonja)
- Not a work order management tool (SF Facilities already handles that)
- Not yet designed — this stub is just a parking lot for the concept

---

## Relationship to SF Client Dashboard

The SF client dashboard is currently a hub — overview of whatever modules a client has active. The client project module would be one of those modules — opt-in, not always-on.

```
SF Client Dashboard
├── TM Reporting Portal (if enabled)
├── Work Orders (if SF Facilities enabled)
├── Billing (if SF Facilities enabled)
├── [Client Project Module] ← this stub, future opt-in
└── ...other modules
```

---

## Next Step

When ready to scope this properly, start a new planning session with this stub as input. Do not design or build this module until the questions above have answers.

**Do not start this module until:**
- SF Core Phase 1 is complete
- SF Facilities modules are defined
- The client dashboard hub is designed
- The questions in this stub are answered

---

*This is a concept stub, not a spec. It exists so the idea is not lost.*  
*When ready to build, start from scratch with a proper planning session.*
