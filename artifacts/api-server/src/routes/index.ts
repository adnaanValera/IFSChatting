import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import shipmentsRouter from "./shipments";
import companiesRouter from "./companies";
import statsRouter from "./stats";
import staffRouter from "./staff";
import feedbackRouter from "./feedback";
import notificationsRouter from "./notifications";
import announcementsRouter from "./announcements";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(shipmentsRouter);
router.use(companiesRouter);
router.use(statsRouter);
router.use(staffRouter);
router.use(feedbackRouter);
router.use(notificationsRouter);
router.use(announcementsRouter);

export default router;
