# Omen Backend Documentation

Welcome to the Omen backend documentation. This directory contains detailed technical documentation for various components and systems.

## 📊 Analytics & Data

### [Supabase Analytics Architecture](./SUPABASE_ANALYTICS_ARCHITECTURE.md)
**Complete guide to the Supabase-based analytics system**
- Event ingestion via Edge Functions
- Partitioned database schema
- SQL optimization strategies  
- Repository implementation
- Performance benchmarks

### [Analytics Scalability Plan](./ANALYTICS_SCALABILITY_PLAN.md)
Long-term scalability strategy for analytics infrastructure

---

## 🧪 Experimentation

### [Experiment Management API](./experiment-management-api.md)
API endpoints and workflows for managing A/B experiments

### [Pipeline](./PIPELINE.md)
Overview of the experimentation pipeline from hypothesis to deployment

### [Test Variants](./TEST_VARIANTS.md)
Guide to creating and testing experiment variants

---

## 🎨 Variant Generation

### [Selector Generation Flow](./SELECTOR_GENERATION_FLOW.md)
How CSS selectors are generated for variant targeting

### [Inject Positions](./inject-positions.md)
Documentation on variant injection positions and strategies

### [State Management Solution](./STATE_MANAGEMENT_SOLUTION.md)
Client-side state management for experiments

---

## 🚀 Quick Links

- [Main Setup Guide](../../SUPABASE_ANALYTICS_SETUP.md)
- [Agent Guidelines](../AGENTS.md)
- [Environment Template](../env.template)

---

## 📝 Document Index

| Document | Purpose | Last Updated |
|----------|---------|--------------|
| [SUPABASE_ANALYTICS_ARCHITECTURE.md](./SUPABASE_ANALYTICS_ARCHITECTURE.md) | Supabase analytics system architecture | 2024 |
| [ANALYTICS_SCALABILITY_PLAN.md](./ANALYTICS_SCALABILITY_PLAN.md) | Analytics scaling strategy | - |
| [experiment-management-api.md](./experiment-management-api.md) | Experiment API documentation | - |
| [PIPELINE.md](./PIPELINE.md) | Experimentation pipeline overview | - |
| [TEST_VARIANTS.md](./TEST_VARIANTS.md) | Variant testing guide | - |
| [SELECTOR_GENERATION_FLOW.md](./SELECTOR_GENERATION_FLOW.md) | CSS selector generation | - |
| [inject-positions.md](./inject-positions.md) | Variant injection documentation | - |
| [STATE_MANAGEMENT_SOLUTION.md](./STATE_MANAGEMENT_SOLUTION.md) | Client state management | - |

---

## 🤝 Contributing

When adding new documentation:

1. Create a descriptive markdown file in this directory
2. Add an entry to this README
3. Link from relevant sections in other docs
4. Use clear headings and code examples
5. Include architecture diagrams when helpful

---

## 📞 Support

For questions about these documents or the systems they describe, please contact the engineering team or open an issue.

