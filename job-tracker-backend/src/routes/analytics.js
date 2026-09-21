const { Router } = require('express');
const { authMiddleware, prisma } = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

// ─── GET /api/analytics/dashboard ─────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Total applications
    const totalApplications = await prisma.application.count({ where: { userId } });

    // Applications by status — SQLite compatible
    const statusCountsResult = await prisma.application.groupBy({
      by: ['status'],
      where: { userId },
      _count: { id: true },
    });

    const statusCounts = statusCountsResult.map((s) => ({
      status: s.status,
      count: s._count.id,
    }));

    // Response rate: distinct applications that have progressed past WISHLIST
    const distinctResponded = await prisma.statusHistory.findMany({
      where: { application: { userId }, status: { not: 'WISHLIST' } },
      select: { applicationId: true },
      distinct: ['applicationId'],
    });
    const responseRate = totalApplications > 0
      ? Math.round((distinctResponded.length / totalApplications) * 100)
      : 0;

    // Average days to first response (skip pure WISHLIST histories)
    const applicationsWithHistory = await prisma.application.findMany({
      where: { userId },
      include: {
        statusHistory: {
          orderBy: { changedAt: 'asc' },
        },
      },
    });

    const responseTimes = [];
    for (const app of applicationsWithHistory) {
      if (!app.appliedDate || app.statusHistory.length === 0) continue;
      const firstResponse = app.statusHistory.find((h) => h.status !== 'WISHLIST');
      if (!firstResponse) continue;
      const days = (firstResponse.changedAt - app.appliedDate) / (1000 * 60 * 60 * 24);
      if (days >= 0) responseTimes.push(days);
    }

    const avgDaysToFirstResponse =
      responseTimes.length > 0
        ? Math.round(
            (responseTimes.reduce((a, b) => a + b, 0) /
              responseTimes.length) *
              10
          ) / 10
        : 0;

    // Applications per week (last 8 weeks) — fetch then bucket in JS (SQLite compatible)
    const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
    const appsForWeeks = await prisma.application.findMany({
      where: { userId, createdAt: { gte: eightWeeksAgo } },
      select: { createdAt: true },
    });

    const applicationsPerWeekMap = new Map();
    for (const a of appsForWeeks) {
      const d = new Date(a.createdAt);
      // UTC Monday
      const utcDay = d.getUTCDay();
      const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday));
      monday.setUTCHours(0, 0, 0, 0);
      const weekKey = monday.toISOString();
      applicationsPerWeekMap.set(weekKey, (applicationsPerWeekMap.get(weekKey) || 0) + 1);
    }

    const applicationsPerWeek = Array.from(applicationsPerWeekMap.entries()).map(([week, count]) => ({
      week,
      count,
    }));

    // Fill in missing weeks with 0 (UTC Mondays)
    const weekLabels = [];
    // Find most recent Monday in UTC
    const nowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const nowUtcDay = nowUtc.getUTCDay();
    const diffToCurrentMonday = nowUtcDay === 0 ? -6 : 1 - nowUtcDay;
    const currentMonday = new Date(nowUtc);
    currentMonday.setUTCDate(nowUtc.getUTCDate() + diffToCurrentMonday);
    currentMonday.setUTCHours(0, 0, 0, 0);
    for (let i = 7; i >= 0; i--) {
      const d = new Date(currentMonday);
      d.setUTCDate(currentMonday.getUTCDate() - i * 7);
      weekLabels.push(d.toISOString());
    }

    const filledWeekly = weekLabels.map((week) => {
      const match = applicationsPerWeek.find((w) => w.week === week);
      return { week, count: match ? match.count : 0 };
    });

    // Recent applications (last 10)
    const recentApplications = await prisma.application.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        company: true,
        jobTitle: true,
        status: true,
        createdAt: true,
      },
    });

    const formattedRecent = recentApplications.map((app) => ({
      ...app,
      createdAt: app.createdAt.toISOString(),
    }));

    res.json({
      totalApplications,
      responseRate,
      avgDaysToFirstResponse,
      applicationsPerWeek: filledWeekly,
      recentApplications: formattedRecent,
      statusBreakdown: statusCounts.map((s) => ({
        status: s.status,
        count: Number(s.count),
      })),
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
