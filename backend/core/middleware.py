"""Audit log middleware: record who did what, when."""
import logging
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


class AuditLogMiddleware(MiddlewareMixin):
    """Log authenticated API actions to AuditLog (optional; can be done in views)."""
    def process_request(self, request):
        request._audit_action = None
        request._audit_model = None
        request._audit_object_id = None
        request._audit_details = {}
        return None

    def process_response(self, request, response):
        if getattr(request, 'user', None) and getattr(request.user, 'is_authenticated', False) and request._audit_action:
            try:
                from core.models import AuditLog
                AuditLog.objects.create(
                    user=request.user,
                    action=request._audit_action,
                    model_name=getattr(request, '_audit_model', '') or '',
                    object_id=str(getattr(request, '_audit_object_id', '') or ''),
                    details=getattr(request, '_audit_details', {}) or {},
                    ip_address=self._get_client_ip(request),
                )
            except Exception as e:
                logger.warning('AuditLog create failed: %s', e)
        return response

    @staticmethod
    def _get_client_ip(request):
        xff = request.META.get('HTTP_X_FORWARDED_FOR')
        if xff:
            return xff.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')
