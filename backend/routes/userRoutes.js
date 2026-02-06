const express = require('express');
const router = express.Router();
const UsersController = require('../controllers/usersController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.use(requireAuth, requireAdmin);

router.get('/', UsersController.list);
router.post('/', UsersController.create);
router.put('/:id', UsersController.update);
router.delete('/:id', UsersController.remove);

module.exports = router;
