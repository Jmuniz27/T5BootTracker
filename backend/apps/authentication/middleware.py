"""Middleware for tracking user last activity."""
import logging
from django.conf import settings
from django.utils.timezone import now

logger = logging.getLogger(__name__)


class LastActivityMiddleware:
    """Stores last activity timestamp in Redis for authenticated users."""

    def __init__(self, get_response):
        self.get_response = get_response
        self._redis = None

    def _get_redis(self):
        if self._redis is None:
            import redis
            self._redis = redis.from_url(settings.REDIS_URL)
        return self._redis

    def __call__(self, request):
        response = self.get_response(request)
        try:
            if request.user.is_authenticated:
                r = self._get_redis()
                r.set(
                    f'last_activity:{request.user.id}',
                    now().isoformat(),
                    ex=3600,
                )
        except Exception:
            # Never block the response due to Redis issues
            logger.debug('LastActivityMiddleware: could not update Redis', exc_info=True)
        return response
