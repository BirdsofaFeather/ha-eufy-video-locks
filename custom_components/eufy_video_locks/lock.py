# Modified for configurable Eufy Video Locks distribution, October 2026.
"""
Lock platform — the `lock` capability's dedicated lock()/unlock() actions.

Unlike a writable bool property, a eufy lock has no reachable `device.set` path
(see `locked` in the SDK: `writtenElsewhere` points at these two actions, not a
sibling property) — so this bypasses `switch.py`'s generic property routing
entirely and calls `client.action()` directly.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.components.lock import LockEntity
from homeassistant.helpers.event import async_call_later

from .entity import EufySdkDeviceEntity, has_capability

LOCK_OWNED_PROPS = frozenset({"locked"})

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .coordinator import EufySdkDataUpdateCoordinator
    from .data import EufySdkConfigEntry

# Sending a command does not prove the bolt moved. Show confirmed device
# readings or lockState events, then refresh after the action.
POST_ACTION_REFRESH_SECS = 20


async def async_setup_entry(
    hass: HomeAssistant,  # noqa: ARG001
    entry: EufySdkConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create a Lock entity per device that declares the `lock` capability."""
    coordinator = entry.runtime_data.coordinator
    entities = [
        EufySdkLock(coordinator, sn)
        for sn, dev in coordinator.data.items()
        if has_capability(dev, "lock")
    ]
    async_add_entities(entities)


class EufySdkLock(EufySdkDeviceEntity, LockEntity):
    """A eufy smart lock, driven by the SDK's `lock`/`unlock` actions."""

    def __init__(self, coordinator: EufySdkDataUpdateCoordinator, sn: str) -> None:
        """Bind to a lock-capable device serial."""
        super().__init__(coordinator, sn)
        self._attr_unique_id = f"{sn}_lock"
        self._post_action_unsub = None

    @property
    def is_locked(self) -> bool | None:
        """The latest confirmed device reading or lockState event."""
        v = self.device.get("state", {}).get("locked")
        return v if type(v) is bool else None

    async def async_lock(self, **_: Any) -> None:
        """Lock the deadbolt/door."""
        await self._actuate(locked=True)

    async def async_unlock(self, **_: Any) -> None:
        """Unlock the deadbolt/door."""
        await self._actuate(locked=False)

    async def _actuate(self, *, locked: bool) -> None:
        """Call the action; retain reported state until the device confirms a change."""
        client = self.client
        await client.action(self._sn, "lock" if locked else "unlock")
        self.async_write_ha_state()
        if self._post_action_unsub is not None:
            self._post_action_unsub()
        self._post_action_unsub = async_call_later(
            self.hass, POST_ACTION_REFRESH_SECS, self._post_action_refresh
        )

    def _post_action_refresh(self, _now: Any) -> None:
        """Fire the delayed post-action reconcile."""
        self._post_action_unsub = None
        self.hass.async_create_task(self._reconcile())

    async def _reconcile(self) -> None:
        """Pull fresh reported state and re-render."""
        await self.coordinator.async_request_refresh()
        self.async_write_ha_state()

    async def async_will_remove_from_hass(self) -> None:
        """Cancel a pending delayed refresh when the entity goes away."""
        if self._post_action_unsub is not None:
            self._post_action_unsub()
            self._post_action_unsub = None
        await super().async_will_remove_from_hass()
