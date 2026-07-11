# backend/logger.py
"""
Structured logging module for LDM AI Trading Backend.
Use these loggers instead of print() throughout the backend.
"""
import logging
import sys
import os


def setup_logger(name: str) -> logging.Logger:
    """Create a logger with consistent format. Use in place of print() everywhere."""
    logger = logging.getLogger(name)

    if logger.handlers:
        return logger  # Avoid duplicate handlers on re-import

    level = logging.DEBUG if os.getenv("ENVIRONMENT", "development") != "production" else logging.INFO
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False
    return logger


# Pre-built loggers for each module — import these directly
main_logger = setup_logger("ldm.main")
agent_logger = setup_logger("ldm.agents")
model_logger = setup_logger("ldm.model")
auth_logger = setup_logger("ldm.auth")
