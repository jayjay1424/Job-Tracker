const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware, prisma } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

// Validation helper
function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return null;
}

// ─── GET /api/reminders ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const reminders = await prisma.reminder.findMany({
      where: {
        application: { userId },
      },
      include: {
        application: {
          select: {
            id: true,
            company: true,
            jobTitle: true,
            status: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const formatted = reminders.map((r) => ({
      ...r,
      dueDate: r.dueDate.toISOString(),
      isCompleted: r.isCompleted,
      application: {
        id: r.application.id,
        company: r.application.company,
        jobTitle: r.application.jobTitle,
        status: r.application.status,
      },
    }));

    const now = new Date();
    const upcoming = formatted.filter((r) => !r.isCompleted && new Date(r.dueDate) >= now);
    const overdue = formatted.filter((r) => !r.isCompleted && new Date(r.dueDate) < now);
    const completed = formatted.filter((r) => r.isCompleted);

    res.json({
      reminders: formatted,
      upcoming,
      overdue,
      completed,
      total: reminders.length,
      upcomingCount: upcoming.length,
      overdueCount: overdue.length,
    });
  } catch (err) {
    console.error('Get reminders error:', err);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// ─── POST /api/reminders ──────────────────────────────────────────────
router.post(
  '/',
  [
    body('applicationId').trim().notEmpty().withMessage('Application ID is required'),
    body('dueDate').isISO8601().withMessage('Valid due date is required'),
    body('message').trim().isLength({ min: 1, max: 500 }).withMessage('Message is required (max 500)'),
  ],
  async (req, res) => {
    try {
      const errors = validate(req, res);
      if (errors) return;

      const { applicationId, dueDate, message } = req.body;
      const userId = req.user.id;

      const parsedDue = new Date(dueDate);
      if (isNaN(parsedDue.getTime())) return res.status(400).json({ error: 'Invalid due date' });

      const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
      });
      if (!application) {
        return res.status(404).json({ error: 'Application not found' });
      }

      const reminder = await prisma.reminder.create({
        data: {
          applicationId,
          dueDate: parsedDue,
          message: String(message).trim().slice(0, 500),
          isCompleted: false,
        },
        include: {
          application: {
            select: {
              id: true,
              company: true,
              jobTitle: true,
              status: true,
            },
          },
        },
      });

      const formatted = {
        ...reminder,
        dueDate: reminder.dueDate.toISOString(),
        application: {
          id: reminder.application.id,
          company: reminder.application.company,
          jobTitle: reminder.application.jobTitle,
          status: reminder.application.status,
        },
      };

      res.status(201).json({ reminder: formatted });
    } catch (err) {
      console.error('Create reminder error:', err);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  }
);

// ─── PATCH /api/reminders/:id ─────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.user.id;

    const reminder = await prisma.reminder.findFirst({
      where: {
        id: req.params.id,
        application: { userId },
      },
    });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const nextCompleted = typeof req.body?.isCompleted === 'boolean' ? req.body.isCompleted : !reminder.isCompleted;

    const updated = await prisma.reminder.update({
      where: { id: req.params.id },
      data: {
        isCompleted: nextCompleted,
      },
      include: {
        application: {
          select: {
            id: true,
            company: true,
            jobTitle: true,
            status: true,
          },
        },
      },
    });

    const formatted = {
      ...updated,
      dueDate: updated.dueDate.toISOString(),
      application: {
        id: updated.application.id,
        company: updated.application.company,
        jobTitle: updated.application.jobTitle,
        status: updated.application.status,
      },
    };

    res.json({ reminder: formatted });
  } catch (err) {
    console.error('Toggle reminder error:', err);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// ─── DELETE /api/reminders/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;

    const reminder = await prisma.reminder.findFirst({
      where: {
        id: req.params.id,
        application: { userId },
      },
    });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    await prisma.reminder.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Reminder deleted' });
  } catch (err) {
    console.error('Delete reminder error:', err);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

module.exports = router;
